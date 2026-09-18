import asyncio
import json
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path


WORKER_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER_ROOT))

from cnes_sync import (  # noqa: E402
    SnapshotValidationError,
    _download_selected_files,
    _check_result,
    _metadata_matches_existing,
    _parse_args,
    _records,
    discover_cnes_files_from_client,
    latest_common_competence,
    normalize_tables,
    publish_snapshot,
    rebuild_public_from_private,
    select_cnes_files,
)


COMPETENCE = "202608"


def establishment(cnes="0123456", municipality="210120"):
    return {
        "CO_UNIDADE": f"{municipality}{cnes}",
        "CO_CNES": cnes,
        "NO_FANTASIA": "UNIDADE TESTE",
        "COMPETENCIA": COMPETENCE,
    }


def professional(
    cns="700000000000001",
    cbo="223505",
    relationship="01",
    municipality="210120",
):
    return {
        "CO_UNIDADE": f"{municipality}0123456",
        "NU_CNS": cns,
        "CO_CBO": cbo,
        "CO_VINCULACAO": relationship,
        "CO_VINCULO": "02",
        "CO_SUB_VINCULO": "03",
        "QT_CARGA_HORARIA_AMBULATORIAL": "20",
        "QT_CARGA_HOR_HOSP_SUS": "0",
        "QT_CARGA_HORARIA_OUTROS": "0",
        "COMPETENCIA": COMPETENCE,
    }


class NormalizeTablesTests(unittest.TestCase):
    def test_accepts_seven_digit_st_municipality_and_official_pf_link_fields(self):
        st = {"CODUFMUN": "2101200", "CNES": "0123456", "NOME_FANTASIA": "UNIDADE FTP", "COMPETEN": COMPETENCE}
        pf = {"CODUFMUN": "210120", "CNES": "0123456", "CNS_PROF": "700000000000001", "CBO": "223505", "COMPETEN": COMPETENCE, "VINCULAC": "010203", "VINCUL_C": "1", "VINCUL_A": "0", "VINCUL_N": "0", "NOMEPROF": "ANA TESTE", "HORA_AMB": "20", "HORAHOSP": "0", "HORAOUTR": "0"}
        other_link = dict(pf, VINCULAC="090203")

        snapshot = normalize_tables([st], [pf, other_link], COMPETENCE)

        self.assertEqual(snapshot["counts"]["establishments"], 1)
        self.assertEqual(snapshot["counts"]["professional_links"], 2)
        self.assertEqual(snapshot["professionals"][0]["name"], "ANA TESTE")
        self.assertEqual({link["relationship_code"] for link in snapshot["professional_links"]}, {"010203", "090203"})

    def test_placeholder_cns_is_quarantined(self):
        invalid_professional = professional(cns="999999999999999")
        snapshot = normalize_tables([establishment()], [professional(), invalid_professional], COMPETENCE)
        self.assertEqual(len(snapshot["quarantine"]), 1)
        self.assertEqual(snapshot["counts"]["professional_links"], 1)

    def test_conflicting_duplicate_link_is_quarantined(self):
        conflicting = professional()
        conflicting["QT_CARGA_HORARIA_AMBULATORIAL"] = "40"
        snapshot = normalize_tables([establishment()], [professional(), conflicting], COMPETENCE)
        self.assertEqual(len(snapshot["quarantine"]), 1)

    def test_missing_competence_column_aborts_batch(self):
        without_competence = professional()
        del without_competence["COMPETENCIA"]
        with self.assertRaisesRegex(SnapshotValidationError, "COMPETENCIA"):
            normalize_tables([establishment()], [without_competence], COMPETENCE)

    def test_blank_municipality_is_quarantined(self):
        unidentified = professional()
        unidentified["CO_UNIDADE"] = ""
        snapshot = normalize_tables([establishment()], [professional(), unidentified], COMPETENCE)
        self.assertEqual(len(snapshot["quarantine"]), 1)

    def test_accepts_dissemination_st_pf_column_names(self):
        snapshot = normalize_tables(
            [{"CODUFMUN": "210120", "CNES": "0123456", "NOME_FANTASIA": "UNIDADE FTP", "COMPETEN": COMPETENCE}],
            [{"CODUFMUN": "210120", "CNES": "0123456", "CNS_PROF": "700000000000001", "CBO": "223505", "COMPETEN": COMPETENCE, "HORA_AMB": "20", "HORAHOSP": "0", "HORAOUTR": "0"}],
            COMPETENCE,
        )

        self.assertEqual(snapshot["establishments"][0]["cnes"], "0123456")
        self.assertEqual(snapshot["professional_links"][0]["cns"], "700000000000001")
        self.assertEqual(snapshot["professional_links"][0]["ambulatory_hours"], 20)

    def test_keeps_only_bacabal_and_preserves_leading_zeroes(self):
        snapshot = normalize_tables(
            [establishment(), establishment(cnes="7654321", municipality="210121")],
            [professional(), professional(cns="700000000000002", municipality="210121")],
            COMPETENCE,
        )

        self.assertEqual([row["cnes"] for row in snapshot["establishments"]], ["0123456"])
        self.assertEqual([row["cns"] for row in snapshot["professional_links"]], ["700000000000001"])
        self.assertEqual(snapshot["professional_links"][0]["cbo"], "223505")

    def test_keeps_two_distinct_relationships_for_the_same_cns_and_cbo(self):
        snapshot = normalize_tables(
            [establishment()],
            [professional(relationship="01"), professional(relationship="99")],
            COMPETENCE,
        )

        links = snapshot["professional_links"]
        self.assertEqual(len(links), 2)
        self.assertNotEqual(links[0]["business_key"], links[1]["business_key"])
        self.assertNotEqual(links[0]["link_identity"], links[1]["link_identity"])

    def test_link_identity_remains_stable_across_competencies(self):
        previous_st, previous_pf = establishment(), professional()
        previous_st["COMPETENCIA"] = previous_pf["COMPETENCIA"] = "202607"
        previous = normalize_tables([previous_st], [previous_pf], "202607")
        current = normalize_tables([establishment()], [professional()], COMPETENCE)
        self.assertEqual(previous["professional_links"][0]["link_identity"], current["professional_links"][0]["link_identity"])
        self.assertNotEqual(previous["professional_links"][0]["business_key"], current["professional_links"][0]["business_key"])

    def test_rejects_missing_required_layout_column(self):
        invalid_professional = professional()
        del invalid_professional["CO_CBO"]

        with self.assertRaisesRegex(SnapshotValidationError, "CO_CBO"):
            normalize_tables([establishment()], [invalid_professional], COMPETENCE)

    def test_rejects_row_without_cns_and_does_not_invent_an_identifier(self):
        invalid_professional = professional()
        del invalid_professional["NU_CNS"]

        with self.assertRaisesRegex(SnapshotValidationError, "NU_CNS"):
            normalize_tables([establishment()], [invalid_professional], COMPETENCE)

    def test_rejects_divergent_row_competence(self):
        out_of_period = professional()
        out_of_period["COMPETENCIA"] = "202607"

        with self.assertRaisesRegex(SnapshotValidationError, "competência"):
            normalize_tables([establishment()], [out_of_period], COMPETENCE)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = normalize_tables([establishment()], [professional()], COMPETENCE)
        self.source_files = [
            {"group": "ST", "filename": "STMA2608.dbc", "sha256": "a" * 64},
            {"group": "PF", "filename": "PFMA2608.dbc", "sha256": "b" * 64},
        ]

    def test_repeat_with_same_source_hashes_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = publish_snapshot(self.snapshot, self.source_files, root)
            second = publish_snapshot(self.snapshot, self.source_files, root)

            self.assertEqual(first["status"], "published")
            self.assertEqual(second["status"], "unchanged")
            self.assertEqual(first["snapshot_path"], second["snapshot_path"])

    def test_rebuild_public_discards_unverified_portaria_134_enrichment(self):
        with tempfile.TemporaryDirectory() as private_directory, tempfile.TemporaryDirectory() as public_directory:
            private_root = Path(private_directory)
            public_root = Path(public_directory)
            publish_snapshot(self.snapshot, self.source_files, private_root, public_root)
            manifest_path = public_root / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            prior_path = public_root / manifest["competencies"][COMPETENCE]["snapshot"]["path"]
            contaminated = json.loads(prior_path.read_text(encoding="utf-8"))
            contaminated["estabelecimentos"][0]["profissionais"][0]["portaria134"] = "SOBREPOSICAO (Art. 2 - 70h)"
            prior_path.write_text(json.dumps(contaminated), encoding="utf-8")
            import hashlib
            manifest["competencies"][COMPETENCE]["snapshot"]["sha256"] = hashlib.sha256(prior_path.read_bytes()).hexdigest()
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            repaired = rebuild_public_from_private(private_root, public_root)

            current = json.loads(manifest_path.read_text(encoding="utf-8"))
            clean_path = public_root / current["competencies"][COMPETENCE]["snapshot"]["path"]
            clean = json.loads(clean_path.read_text(encoding="utf-8"))
            self.assertEqual(repaired, [COMPETENCE])
            self.assertNotEqual(clean_path, prior_path)
            self.assertNotIn("portaria134", clean["estabelecimentos"][0]["profissionais"][0])
            self.assertTrue(prior_path.exists())

    def test_republication_keeps_prior_snapshot_and_advances_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = publish_snapshot(self.snapshot, self.source_files, root)
            revised_sources = [
                {"group": "ST", "filename": "STMA2608.dbc", "sha256": "c" * 64},
                {"group": "PF", "filename": "PFMA2608.dbc", "sha256": "b" * 64},
            ]
            second = publish_snapshot(self.snapshot, revised_sources, root)

            self.assertEqual(second["status"], "republished")
            self.assertGreater(second["revision"], first["revision"])
            self.assertTrue(Path(first["snapshot_path"]).is_file())
            self.assertTrue(Path(second["snapshot_path"]).is_file())
            manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["competencies"][COMPETENCE]["revision"], second["revision"])

    def test_quarantined_snapshot_cannot_replace_the_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            published = publish_snapshot(self.snapshot, self.source_files, root)
            quarantined = dict(self.snapshot)
            quarantined["quarantine"] = [{"reason": "missing_cns", "raw": {"CO_CBO": "223505"}}]

            with self.assertRaisesRegex(SnapshotValidationError, "quarentena"):
                publish_snapshot(quarantined, self.source_files, root)

            manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["competencies"][COMPETENCE]["snapshot_path"], published["snapshot_path"])

    def test_public_manifest_is_ui_shaped_and_has_a_verifiable_snapshot_entry(self):
        with tempfile.TemporaryDirectory() as private_directory, tempfile.TemporaryDirectory() as public_directory:
            publish_snapshot(self.snapshot, self.source_files, Path(private_directory), Path(public_directory))

            manifest = json.loads((Path(public_directory) / "manifest.json").read_text(encoding="utf-8"))
            entry = manifest["competencies"][COMPETENCE]
            payload = json.loads((Path(public_directory) / entry["snapshot"]["path"]).read_text(encoding="utf-8"))
            self.assertEqual(entry["status"], "published")
            self.assertEqual(len(entry["snapshot"]["sha256"]), 64)
            self.assertEqual(payload["competencia"], COMPETENCE)
            self.assertEqual(payload["codigoIbge"], "210120")
            self.assertEqual(payload["estabelecimentos"][0]["profissionais"][0]["cns"], "700000000000001")

    def test_public_failure_does_not_mark_private_manifest_and_a_retry_recovers(self):
        with tempfile.TemporaryDirectory() as private_directory, tempfile.TemporaryDirectory() as public_directory:
            private_root = Path(private_directory)
            public_root = Path(public_directory)
            with mock.patch("cnes_sync._publish_public_snapshot", side_effect=OSError("disk full")):
                with self.assertRaisesRegex(OSError, "disk full"):
                    publish_snapshot(self.snapshot, self.source_files, private_root, public_root)
            self.assertFalse((private_root / "manifest.json").exists())

            result = publish_snapshot(self.snapshot, self.source_files, private_root, public_root)
            self.assertEqual(result["status"], "published")
            self.assertTrue((private_root / "manifest.json").exists())

    def test_backfill_of_an_older_competence_does_not_move_active_pointer_backwards(self):
        old_establishment = establishment()
        old_professional = professional()
        old_establishment["COMPETENCIA"] = "202607"
        old_professional["COMPETENCIA"] = "202607"
        old_snapshot = normalize_tables([old_establishment], [old_professional], "202607")
        with tempfile.TemporaryDirectory() as private_directory, tempfile.TemporaryDirectory() as public_directory:
            publish_snapshot(self.snapshot, self.source_files, Path(private_directory), Path(public_directory))
            publish_snapshot(old_snapshot, self.source_files, Path(private_directory), Path(public_directory))
            private_manifest = json.loads((Path(private_directory) / "manifest.json").read_text(encoding="utf-8"))
            public_manifest = json.loads((Path(public_directory) / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(private_manifest["active_competence"], COMPETENCE)
            self.assertEqual(public_manifest["active_competence"], COMPETENCE)


class DiscoveryTests(unittest.TestCase):
    def test_check_result_is_json_serializable_without_remote_objects(self):
        result = _check_result([{"name": "PFMA2608.dbc", "group": "PF", "state": "MA", "year": 2026, "month": 8, "size": 10, "modified": "2026-09-01", "raw": object()}])
        self.assertEqual(result["competence"], COMPETENCE)
        self.assertEqual(result["files"][0]["group"], "PF")
        self.assertNotIn("raw", result["files"][0])
        json.dumps(result)

    def test_cli_default_roots_are_anchored_at_the_repository(self):
        args = _parse_args(["check", "202608"])
        self.assertTrue(args.private_root.is_absolute())
        self.assertTrue(args.public_root.is_absolute())
        self.assertEqual(args.private_root.parts[-2:], ("data", "cnes"))

    def test_reuses_a_snapshot_only_when_each_remote_metadata_value_matches(self):
        existing = {
            "groups": {
                "ST": {"filename": "STMA2608.dbc", "size": 10, "modified": "2026-09-01"},
                "PF": {"filename": "PFMA2608.dbc", "size": 20, "modified": "2026-09-01"},
            }
        }
        selected = [
            {"name": "STMA2608.dbc", "group": "ST", "size": 10, "modified": "2026-09-01"},
            {"name": "PFMA2608.dbc", "group": "PF", "size": 20, "modified": "2026-09-01"},
        ]
        self.assertTrue(_metadata_matches_existing(existing, selected))
        selected[1]["modified"] = ""
        self.assertFalse(_metadata_matches_existing(existing, selected))

    def test_accepts_polars_style_loaded_table(self):
        class PolarsLikeTable:
            def to_dicts(self):
                return [{"CODUFMUN": "210120"}]

        self.assertEqual(_records(PolarsLikeTable()), [{"CODUFMUN": "210120"}])

    def test_downloads_the_discovered_remote_file_and_keeps_hashed_raw_dbc(self):
        class LocalFile:
            def __init__(self, path, rows):
                self.path = path
                self.rows = rows

            async def load(self):
                return self.rows

        class RemoteFile:
            def __init__(self, rows):
                self.rows = rows
                self.downloaded = False

            async def download(self, output):
                self.downloaded = True
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(b"fake DBC bytes")
                return LocalFile(output, self.rows)

        st_remote = RemoteFile([establishment()])
        pf_remote = RemoteFile([professional()])
        selected = [
            {"name": "STMA2608.dbc", "group": "ST", "year": 2026, "month": 8, "modified": "2026-09-01", "raw": st_remote},
            {"name": "PFMA2608.dbc", "group": "PF", "year": 2026, "month": 8, "modified": "2026-09-01", "raw": pf_remote},
        ]
        with tempfile.TemporaryDirectory() as directory:
            rows, sources = asyncio.run(_download_selected_files(selected, Path(directory)))
            self.assertTrue(st_remote.downloaded)
            self.assertTrue(pf_remote.downloaded)
            self.assertEqual(rows["PF"][0]["NU_CNS"], "700000000000001")
            self.assertTrue((Path(directory) / "raw" / COMPETENCE / "ST" / sources[0]["sha256"] / "STMA2608.dbc").is_file())

    def test_discovers_through_async_dataset_content_and_group_files(self):
        class FakeGroup:
            @property
            def files(self):
                async def result():
                    return [
                        {"name": "STMA2608.dbc", "group": "ST", "state": "MA", "year": 2026, "month": 8},
                        {"name": "PFMA2608.dbc", "group": "PF", "state": "MA", "year": 2026, "month": 8},
                    ]
                return result()

        class FakeDataset:
            name = "CNES"

            @property
            def content(self):
                async def result():
                    return [FakeGroup()]
                return result()

        class FakeFtp:
            async def datasets(self):
                return [FakeDataset()]

        selected = asyncio.run(discover_cnes_files_from_client(FakeFtp()))
        self.assertEqual([item["name"] for item in selected], ["PFMA2608.dbc", "STMA2608.dbc"])

    def test_finds_the_latest_competence_with_both_st_and_pf(self):
        files = [
            {"name": "STMA2607.dbc", "group": "ST", "state": "MA", "year": 2026, "month": 7},
            {"name": "PFMA2607.dbc", "group": "PF", "state": "MA", "year": 2026, "month": 7},
            {"name": "STMA2608.dbc", "group": "ST", "state": "MA", "year": 2026, "month": 8},
        ]
        self.assertEqual(latest_common_competence(files), "202607")
    def test_selects_st_and_pf_for_ma_and_the_requested_competence(self):
        files = [
            {"name": "STMA2608.dbc", "group": "ST", "state": "MA", "year": 2026, "month": 8, "size": 10},
            {"name": "PFMA2608.dbc", "group": "PF", "state": "MA", "year": 2026, "month": 8, "size": 20},
            {"name": "EQMA2608.dbc", "group": "EQ", "state": "MA", "year": 2026, "month": 8, "size": 30},
            {"name": "STMA2607.dbc", "group": "ST", "state": "MA", "year": 2026, "month": 7, "size": 40},
            {"name": "PFPI2608.dbc", "group": "PF", "state": "PI", "year": 2026, "month": 8, "size": 50},
        ]

        selected = select_cnes_files(files, COMPETENCE)

        self.assertEqual([item["name"] for item in selected], ["PFMA2608.dbc", "STMA2608.dbc"])

    def test_requires_both_st_and_pf(self):
        with self.assertRaisesRegex(SnapshotValidationError, "PF"):
            select_cnes_files(
                [{"name": "STMA2608.dbc", "group": "ST", "state": "MA", "year": 2026, "month": 8}],
                COMPETENCE,
            )


if __name__ == "__main__":
    unittest.main()
