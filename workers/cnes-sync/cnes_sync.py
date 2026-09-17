"""Fail-closed CNES snapshot worker for Bacabal (IBGE 210120)."""

from __future__ import annotations

import argparse
import asyncio
import copy
import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


SCOPE_IBGE = "210120"
SCOPE_UF = "MA"
GROUPS = ("ST", "PF")
SCHEMA_VERSION = 1
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PRIVATE_ROOT = REPOSITORY_ROOT / "data" / "cnes"
DEFAULT_PUBLIC_ROOT = REPOSITORY_ROOT / "code_sandbox_light_git_fe61910d_1781185357" / "cnes_data" / "auto"


class SnapshotValidationError(ValueError):
    """The input cannot safely replace a previously published snapshot."""


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _sha256(value: Any) -> str:
    return hashlib.sha256(value if isinstance(value, bytes) else _canonical_json(value)).hexdigest()


def _as_text(value: Any, field: str, width: int | None = None) -> str:
    if value is None:
        raise SnapshotValidationError(f"campo obrigatório vazio: {field}")
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        raise SnapshotValidationError(f"campo obrigatório vazio: {field}")
    if text.endswith(".0") and text[:-2].isdigit():
        text = text[:-2]
    if width is not None:
        if not text.isdigit() or len(text) > width:
            raise SnapshotValidationError(f"identificador inválido em {field}: {text!r}")
        text = text.zfill(width)
    return text


def _optional_text(value: Any, width: int | None = None) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        return ""
    if text.endswith(".0") and text[:-2].isdigit():
        text = text[:-2]
    return text.zfill(width) if width is not None and text.isdigit() else text


def _competence(value: Any) -> str:
    text = _as_text(value, "competência")
    if not re.fullmatch(r"\d{6}", text) or not 1 <= int(text[4:]) <= 12:
        raise SnapshotValidationError(f"competência inválida: {text!r}")
    return text


def _mapping_rows(rows: Iterable[Mapping[str, Any]] | None, label: str) -> list[dict[str, Any]]:
    if rows is None:
        raise SnapshotValidationError(f"tabela {label} ausente")
    result: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        if not isinstance(row, Mapping):
            raise SnapshotValidationError(f"linha {index} de {label} não é um registro")
        result.append(dict(row))
    if not result:
        raise SnapshotValidationError(f"tabela {label} vazia")
    return result


def _require_aliases(rows: Sequence[Mapping[str, Any]], aliases: Sequence[Sequence[str]], label: str) -> None:
    """Require one field from each official-layout alias group in every row."""

    for index, row in enumerate(rows):
        missing = ["/".join(group) for group in aliases if not any(column in row for column in group)]
        if missing:
            raise SnapshotValidationError(f"layout de {label}, linha {index}, sem coluna(s): {', '.join(missing)}")


def _first_value(row: Mapping[str, Any], *columns: str) -> Any:
    for column in columns:
        value = row.get(column)
        if value is not None and str(value).strip() != "":
            return value
    return None


def _assert_competence(rows: Sequence[Mapping[str, Any]], expected: str, label: str) -> None:
    for index, row in enumerate(rows):
        supplied = _first_value(row, "COMPETENCIA", "competencia", "COMPETEN")
        if supplied is None or str(supplied).strip() == "":
            raise SnapshotValidationError(f"competência ausente em {label}, linha {index}")
        actual = _competence(supplied)
        if actual != expected:
            raise SnapshotValidationError(
                f"competência divergente em {label}, linha {index}: {actual}; esperado {expected}"
            )


def _municipality_from_row(row: Mapping[str, Any]) -> str:
    unit = _optional_text(row.get("CO_UNIDADE"))
    if len(unit) >= 6 and unit[:6].isdigit():
        return unit[:6]
    for column in ("CO_MUNICIPIO", "CODUFMUN", "CO_MUNICIPIO_GESTOR"):
        candidate = _optional_text(row.get(column))
        if candidate:
            # ST may carry a seventh digit; the IBGE municipality is the
            # leading six digits. PF uses six in the DATASUS layout.
            return candidate[:6]
    return ""


def _hours(row: Mapping[str, Any], *columns: str) -> int:
    for column in columns:
        raw = row.get(column)
        if raw is None or str(raw).strip() == "":
            continue
        try:
            return int(float(str(raw).replace(",", ".")))
        except ValueError as error:
            raise SnapshotValidationError(f"carga horária inválida em {column}: {raw!r}") from error
    return 0


def _safe_source_row_hash(row: Mapping[str, Any]) -> str:
    # Retain an audit anchor without copying raw fields such as CPF to the public artifact.
    return _sha256({str(key): _optional_text(value) for key, value in row.items()})


def normalize_tables(
    st_rows: Iterable[Mapping[str, Any]],
    pf_rows: Iterable[Mapping[str, Any]],
    competence: str,
) -> dict[str, Any]:
    """Validate and normalize CNES ST/PF rows for Bacabal."""

    expected_competence = _competence(competence)
    establishments_raw = _mapping_rows(st_rows, "ST")
    professionals_raw = _mapping_rows(pf_rows, "PF")
    _require_aliases(establishments_raw, (("CO_UNIDADE", "CODUFMUN"), ("CO_CNES", "CNES"), ("COMPETENCIA", "competencia", "COMPETEN")), "ST")
    _require_aliases(
        professionals_raw,
        (("CO_UNIDADE", "CODUFMUN"), ("CO_UNIDADE", "CO_CNES", "CNES"), ("NU_CNS", "CNS_PROF"), ("CO_CBO", "CBO"), ("COMPETENCIA", "competencia", "COMPETEN")),
        "PF",
    )
    _assert_competence(establishments_raw, expected_competence, "ST")
    _assert_competence(professionals_raw, expected_competence, "PF")

    quarantine: list[dict[str, Any]] = []
    establishments: dict[str, dict[str, Any]] = {}
    professionals: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(establishments_raw):
        municipality = _municipality_from_row(row)
        if not re.fullmatch(r"\d{6}", municipality):
            quarantine.append({"dataset": "ST", "row": index, "reason": "município inválido", "row_hash": _safe_source_row_hash(row)})
            continue
        if municipality != SCOPE_IBGE:
            continue
        try:
            cnes = _as_text(_first_value(row, "CO_CNES", "CNES"), "CO_CNES/CNES", width=7)
        except SnapshotValidationError as error:
            quarantine.append({"dataset": "ST", "row": index, "reason": str(error), "row_hash": _safe_source_row_hash(row)})
            continue
        establishments[cnes] = {
            "cnes": cnes,
            "municipality_ibge": SCOPE_IBGE,
            "name": _optional_text(_first_value(row, "NO_FANTASIA", "NOME_FANTASIA", "NO_RAZAO_SOCIAL", "NOME")),
            "unit_type_code": _optional_text(_first_value(row, "TP_UNID", "CO_TIPO_UNIDADE")),
            "management_code": _optional_text(_first_value(row, "TPGESTAO", "CO_GESTAO")),
            "source_row_hash": _safe_source_row_hash(row),
        }

    links: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(professionals_raw):
        municipality = _municipality_from_row(row)
        if not re.fullmatch(r"\d{6}", municipality):
            quarantine.append({"dataset": "PF", "row": index, "reason": "município inválido", "row_hash": _safe_source_row_hash(row)})
            continue
        if municipality != SCOPE_IBGE:
            continue
        try:
            unit = _optional_text(row.get("CO_UNIDADE"))
            cnes = _as_text(_first_value(row, "CO_CNES", "CNES") or (unit[6:] if len(unit) > 6 else None), "CO_CNES/CNES", width=7)
            cns = _as_text(_first_value(row, "NU_CNS", "CNS_PROF"), "NU_CNS/CNS_PROF", width=15)
            if cns in {"0" * 15, "9" * 15}:
                raise SnapshotValidationError("CNS_PROF ausente ou marcador inválido")
            cbo = _as_text(_first_value(row, "CO_CBO", "CBO"), "CO_CBO/CBO", width=6)
            relationship = _optional_text(_first_value(row, "CO_VINCULACAO", "VINCULAC"))
            employment = _optional_text(row.get("CO_VINCULO"))
            sub_employment = _optional_text(row.get("CO_SUB_VINCULO"))
            contract_flags = [_optional_text(row.get(column)) for column in ("VINCUL_C", "VINCUL_A", "VINCUL_N")]
            link_identity = _sha256([cnes, cns, cbo, relationship, employment, sub_employment, *contract_flags])
            business_key = _sha256([expected_competence, link_identity])
            name = _optional_text(_first_value(row, "NOMEPROF", "NO_PROFISSIONAL", "NOME_PROFISSIONAL"))
            prior_professional = professionals.get(cns)
            if prior_professional and name and prior_professional["name"] and prior_professional["name"] != name:
                raise SnapshotValidationError("nomes divergentes para o mesmo CNS")
            link = {
                "business_key": business_key,
                "link_identity": link_identity,
                "cnes": cnes,
                "cns": cns,
                "cbo": cbo,
                "relationship_code": relationship,
                "employment_code": employment,
                "sub_employment_code": sub_employment,
                "contract_flags": contract_flags,
                "ambulatory_hours": _hours(row, "QT_CARGA_HORARIA_AMBULATORIAL", "QT_CARGA_HOR_AMB", "HORA_AMB"),
                "hospital_hours": _hours(row, "QT_CARGA_HOR_HOSP_SUS", "HORAHOSP"),
                "other_hours": _hours(row, "QT_CARGA_HORARIA_OUTROS", "QT_CARGA_HOR_OUTROS", "HORAOUTR"),
                "source_row_hash": _safe_source_row_hash(row),
            }
            prior_link = links.get(business_key)
            if prior_link and any(prior_link[field] != link[field] for field in ("ambulatory_hours", "hospital_hours", "other_hours")):
                raise SnapshotValidationError("vínculo duplicado com carga horária divergente")
            links[business_key] = link
            professionals[cns] = {"cns": cns, "name": name or (prior_professional or {}).get("name", "")}
        except SnapshotValidationError as error:
            quarantine.append({"dataset": "PF", "row": index, "reason": str(error), "row_hash": _safe_source_row_hash(row)})

    if not establishments:
        raise SnapshotValidationError("ST não contém estabelecimentos de Bacabal (210120)")
    if not links:
        raise SnapshotValidationError("PF não contém vínculos profissionais de Bacabal (210120)")
    return {
        "schema_version": SCHEMA_VERSION,
        "scope": {"municipality_ibge": SCOPE_IBGE, "uf": SCOPE_UF},
        "competence": expected_competence,
        "establishments": [establishments[key] for key in sorted(establishments)],
        "professionals": [professionals[key] for key in sorted(professionals)],
        "professional_links": [links[key] for key in sorted(links)],
        "quarantine": quarantine,
        "coverage": {"st": True, "pf": True, "services": False, "habilitations": False, "beds": False, "equipment": False},
        "counts": {"establishments": len(establishments), "professionals": len(professionals), "professional_links": len(links), "quarantined": len(quarantine)},
    }


def _atomic_write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(_canonical_json(value))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def _source_groups(source_files: Iterable[Mapping[str, Any]]) -> dict[str, dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for source in source_files:
        group = _as_text(source.get("group"), "group").upper()
        if group not in GROUPS:
            continue
        if group in groups:
            raise SnapshotValidationError(f"mais de um arquivo {group} selecionado")
        digest = _as_text(source.get("sha256"), "sha256")
        if not re.fullmatch(r"[0-9a-f]{64}", digest.lower()):
            raise SnapshotValidationError(f"SHA-256 inválido para {group}")
        groups[group] = {
            "filename": _as_text(source.get("filename") or source.get("name"), "filename"),
            "sha256": digest.lower(),
            "size": source.get("size"),
            "modified": _optional_text(source.get("modified") or source.get("modify")),
        }
    missing = [group for group in GROUPS if group not in groups]
    if missing:
        raise SnapshotValidationError(f"arquivos CNES obrigatórios ausentes: {', '.join(missing)}")
    return groups


def _read_manifest(root: Path) -> dict[str, Any]:
    manifest_path = root / "manifest.json"
    if not manifest_path.exists():
        return {"schema_version": SCHEMA_VERSION, "scope": {"municipality_ibge": SCOPE_IBGE, "uf": SCOPE_UF}, "competencies": {}}
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SnapshotValidationError(f"manifesto privado inválido: {error}") from error
    if manifest.get("schema_version") != SCHEMA_VERSION or manifest.get("scope", {}).get("municipality_ibge") != SCOPE_IBGE:
        raise SnapshotValidationError("manifesto privado incompatível com o escopo Bacabal")
    if not isinstance(manifest.get("competencies"), dict):
        raise SnapshotValidationError("manifesto privado sem competências válidas")
    return manifest


def _write_quarantine(root: Path, snapshot: Mapping[str, Any]) -> None:
    competence = snapshot.get("competence", "unknown")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    _atomic_write_json(root / "quarantine" / f"{competence}-{timestamp}.json", {"snapshot": snapshot, "reason": "quarentena bloqueia publicação"})


def _public_snapshot(snapshot: Mapping[str, Any]) -> dict[str, Any]:
    """Produce the UI/BPA shape from a minimal ST/PF-only source.

    The worker never fabricates demographic, address, CNPJ, CPF or professional
    name fields.  Consumers can therefore distinguish absent ST/PF coverage from
    real values carried by the official source.
    """

    establishments: dict[str, dict[str, Any]] = {}
    professional_names = {item["cns"]: item.get("name", "") for item in snapshot.get("professionals", [])}
    for item in snapshot["establishments"]:
        cnes = item["cnes"]
        establishments[cnes] = {
            "coUnidade": f"{SCOPE_IBGE}{cnes}",
            "cnes": cnes,
            "nomeFantasia": item.get("name") or f"CNES {cnes}",
            "nomeFantasiaOrigem": "ST" if item.get("name") else "identificador CNES",
            "tipoUnidadeCodigo": item.get("unit_type_code", ""),
            "tipoGestaoCodigo": item.get("management_code", ""),
            "profissionais": [],
        }
    for link in snapshot["professional_links"]:
        establishment = establishments.get(link["cnes"])
        if establishment is None:
            # A PF row without a ST establishment cannot be displayed faithfully.
            raise SnapshotValidationError(f"PF referencia CNES ausente em ST: {link['cnes']}")
        ambulatory = int(link["ambulatory_hours"])
        hospital = int(link["hospital_hours"])
        other = int(link["other_hours"])
        establishment["profissionais"].append(
            {
                "businessKey": link["business_key"],
                "linkIdentity": link["link_identity"],
                "cns": link["cns"],
                "cnsMaster": link["cns"],
                "nome": professional_names.get(link["cns"], ""),
                "cbo": link["cbo"],
                "chAmb": ambulatory,
                "chHosp": hospital,
                "chOutros": other,
                "chTotal": ambulatory + hospital + other,
                "codigoVinculacao": link["relationship_code"],
                "codigoVinculo": link["employment_code"],
                "codigoSubVinculo": link["sub_employment_code"],
            }
        )
    for establishment in establishments.values():
        establishment["profissionais"].sort(key=lambda professional: professional["businessKey"])
    competence = snapshot["competence"]
    return {
        "schema_version": snapshot["schema_version"],
        "municipio": "BACABAL",
        "uf": SCOPE_UF,
        "codigoIbge": SCOPE_IBGE,
        "competencia": competence,
        "versao": f"{competence[:4]}.{competence[4:]}",
        "fonte": "DATASUS / CNES / grupos ST e PF",
        "estabelecimentos": [establishments[cnes] for cnes in sorted(establishments)],
        "coverage": snapshot["coverage"],
        "counts": snapshot["counts"],
        "sourceFiles": snapshot["source_files"],
    }


def _set_active_competence(manifest: dict[str, Any]) -> None:
    competencies = manifest["competencies"]
    if competencies:
        manifest["active_competence"] = max(competencies)


def _publish_public_snapshot(private_snapshot: Mapping[str, Any], record: Mapping[str, Any], public_root: Path) -> None:
    public_payload = _public_snapshot(private_snapshot)
    public_hash = _sha256(public_payload)
    competence = private_snapshot["competence"]
    relative = Path("snapshots") / competence / f"rev-{record['revision']}-{public_hash}.json"
    public_path = public_root / relative
    if public_path.exists():
        if _sha256(json.loads(public_path.read_text(encoding="utf-8"))) != public_hash:
            raise SnapshotValidationError(f"snapshot público imutável diverge: {public_path}")
    else:
        _atomic_write_json(public_path, public_payload)
    manifest = _read_manifest(public_root) if (public_root / "manifest.json").exists() else {"schema_version": SCHEMA_VERSION, "scope": {"municipality_ibge": SCOPE_IBGE, "uf": SCOPE_UF}, "competencies": {}}
    public_record = {
        "revision": record["revision"],
        "status": "published",
        "published_at": record["published_at"],
        "source": record["source"],
        "groups": record["groups"],
        "snapshot": {"path": relative.as_posix(), "sha256": public_hash},
        "counts": record["counts"],
        "coverage": record["coverage"],
    }
    manifest["competencies"][competence] = public_record
    _set_active_competence(manifest)
    _atomic_write_json(public_root / "manifest.json", manifest)


def publish_snapshot(snapshot: Mapping[str, Any], source_files: Iterable[Mapping[str, Any]], root: Path | str, public_root: Path | str | None = None) -> dict[str, Any]:
    """Persist an immutable snapshot and atomically switch the manifest."""

    private_root = Path(root)
    if snapshot.get("scope", {}).get("municipality_ibge") != SCOPE_IBGE:
        raise SnapshotValidationError("snapshot fora do escopo Bacabal (210120)")
    competence = _competence(snapshot.get("competence"))
    groups = _source_groups(source_files)
    if snapshot.get("quarantine"):
        _write_quarantine(private_root, snapshot)
        raise SnapshotValidationError("quarentena presente; manifesto anterior foi preservado")
    manifest = _read_manifest(private_root)
    existing = manifest["competencies"].get(competence)
    source_signature = {group: groups[group]["sha256"] for group in GROUPS}
    if existing and existing.get("source_signature") == source_signature:
        if public_root is not None:
            existing_path = Path(existing["snapshot_path"])
            if not existing_path.is_file():
                raise SnapshotValidationError(f"snapshot privado referenciado não existe: {existing_path}")
            private_snapshot = json.loads(existing_path.read_text(encoding="utf-8"))
            if _sha256(private_snapshot) != existing["snapshot_sha256"]:
                raise SnapshotValidationError(f"hash do snapshot privado diverge: {existing_path}")
            _publish_public_snapshot(private_snapshot, existing, Path(public_root))
        return {"status": "unchanged", "revision": existing["revision"], "snapshot_path": existing["snapshot_path"], "snapshot_sha256": existing["snapshot_sha256"]}
    revision = int(existing.get("revision", 0)) + 1 if existing else 1
    published_snapshot = copy.deepcopy(dict(snapshot))
    published_snapshot["source_files"] = groups
    snapshot_hash = _sha256(published_snapshot)
    snapshot_path = private_root / "snapshots" / competence / f"rev-{revision}-{snapshot_hash}.json"
    if snapshot_path.exists():
        if _sha256(json.loads(snapshot_path.read_text(encoding="utf-8"))) != snapshot_hash:
            raise SnapshotValidationError(f"snapshot imutável diverge: {snapshot_path}")
    else:
        _atomic_write_json(snapshot_path, published_snapshot)
    record = {"revision": revision, "status": "published", "published_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"), "source": "DATASUS_FTP", "source_signature": source_signature, "groups": groups, "snapshot_path": str(snapshot_path.resolve()), "snapshot_sha256": snapshot_hash, "counts": published_snapshot["counts"], "coverage": published_snapshot["coverage"]}
    # Public first: if its atomic manifest cannot be written, the private manifest
    # still points at the last complete publication and a rerun can recover.
    if public_root is not None:
        _publish_public_snapshot(published_snapshot, record, Path(public_root))
    manifest["competencies"][competence] = record
    _set_active_competence(manifest)
    _atomic_write_json(private_root / "manifest.json", manifest)
    return {"status": "republished" if existing else "published", "revision": revision, "snapshot_path": record["snapshot_path"], "snapshot_sha256": snapshot_hash}


def _file_value(item: Any, name: str, default: Any = None) -> Any:
    return item.get(name, default) if isinstance(item, Mapping) else getattr(item, name, default)


def _filename_metadata(item: Any) -> dict[str, Any]:
    name = _file_value(item, "name", _file_value(item, "filename", ""))
    match = re.fullmatch(r"(?P<group>ST|PF)(?P<state>[A-Z]{2})(?P<year>\d{2})(?P<month>\d{2}).*", str(name).upper())
    metadata = {"name": name, "group": _file_value(item, "group"), "state": _file_value(item, "state"), "year": _file_value(item, "year"), "month": _file_value(item, "month"), "size": _file_value(item, "size"), "modified": _file_value(item, "modified", _file_value(item, "modify")), "raw": item}
    if match:
        metadata["group"] = metadata["group"] or match.group("group")
        metadata["state"] = metadata["state"] or match.group("state")
        metadata["year"] = metadata["year"] or int(match.group("year")) + 2000
        metadata["month"] = metadata["month"] or int(match.group("month"))
    return metadata


def latest_common_competence(files: Iterable[Any]) -> str:
    """Find the newest MA competence for which both ST and PF are listed."""

    groups_by_competence: dict[str, set[str]] = {}
    for item in files:
        metadata = _filename_metadata(item)
        group = _optional_text(metadata["group"]).upper()
        state = _optional_text(metadata["state"]).upper()
        try:
            competence = f"{int(metadata['year']):04d}{int(metadata['month']):02d}"
            _competence(competence)
        except (TypeError, ValueError, SnapshotValidationError):
            continue
        if state == SCOPE_UF and group in GROUPS:
            groups_by_competence.setdefault(competence, set()).add(group)
    candidates = [competence for competence, groups in groups_by_competence.items() if set(GROUPS).issubset(groups)]
    if not candidates:
        raise SnapshotValidationError("FTP não possui competência MA com ST e PF")
    return max(candidates)


def select_cnes_files(files: Iterable[Any], competence: str) -> list[dict[str, Any]]:
    """Return exactly one PF and ST MA artifact from a direct FTP listing."""

    target = _competence(competence)
    year, month = int(target[:4]), int(target[4:])
    selected: dict[str, list[dict[str, Any]]] = {group: [] for group in GROUPS}
    for item in files:
        metadata = _filename_metadata(item)
        group, state = _optional_text(metadata["group"]).upper(), _optional_text(metadata["state"]).upper()
        try:
            item_year, item_month = int(metadata["year"]), int(metadata["month"])
        except (TypeError, ValueError):
            continue
        if group in selected and state == SCOPE_UF and item_year == year and item_month == month:
            selected[group].append(metadata)
    missing = [group for group in GROUPS if not selected[group]]
    if missing:
        raise SnapshotValidationError(f"FTP sem arquivo(s) obrigatório(s): {', '.join(missing)} para {target}")
    return [sorted(selected[group], key=lambda entry: (_optional_text(entry["modified"]), str(entry["name"]))) [-1] for group in sorted(GROUPS)]


async def discover_cnes_files_from_client(ftp: Any, competence: str | None = None) -> list[dict[str, Any]]:
    """Discover files from an initialized PySUS FTP client (offline-testable)."""

    datasets = await ftp.datasets()
    cnes = next((dataset for dataset in datasets if getattr(dataset, "name", "") == "CNES"), None)
    if cnes is None:
        raise SnapshotValidationError("dataset CNES não encontrado no FTP DATASUS")
    periods = await cnes.content
    files: list[Any] = []
    for period in periods:
        files.extend(await period.files)
    target = _competence(competence) if competence is not None else latest_common_competence(files)
    return select_cnes_files(files, target)


def _configure_pysus_cache(private_root: Path) -> None:
    cache_path = (private_root / "pysus-cache").resolve()
    cache_path.mkdir(parents=True, exist_ok=True)
    os.environ["PYSUS_CACHEPATH"] = str(cache_path)


async def discover_cnes_files_from_ftp(competence: str | None = None, private_root: Path = DEFAULT_PRIVATE_ROOT) -> list[dict[str, Any]]:
    """List CNES files on DATASUS FTP without relying on PySUS catalog freshness."""

    _configure_pysus_cache(private_root)
    try:
        from pysus.api.ftp.client import FTP
    except ImportError as error:
        raise RuntimeError("PySUS 2.11.2 não está instalado; instale workers/cnes-sync/requirements.txt") from error
    ftp = FTP()
    await ftp.connect()
    try:
        return await discover_cnes_files_from_client(ftp, competence)
    finally:
        close = getattr(ftp, "close", None)
        if close is not None:
            result = close()
            if hasattr(result, "__await__"):
                await result


def _records(table: Any) -> list[dict[str, Any]]:
    if hasattr(table, "to_dicts"):
        return [dict(row) for row in table.to_dicts()]
    if hasattr(table, "to_dict"):
        try:
            return list(table.to_dict("records"))
        except TypeError:
            candidate = table.to_dict()
            if isinstance(candidate, list):
                return candidate
    if isinstance(table, list):
        return [dict(row) for row in table]
    raise SnapshotValidationError("PySUS não retornou uma tabela conversível em registros")


def _file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _selected_competence(selected: Sequence[Mapping[str, Any]]) -> str:
    if not selected:
        raise SnapshotValidationError("nenhum arquivo CNES selecionado")
    try:
        return _competence(f"{int(selected[0]['year']):04d}{int(selected[0]['month']):02d}")
    except (KeyError, TypeError, ValueError) as error:
        raise SnapshotValidationError("metadado FTP sem competência válida") from error


def _check_result(selected: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    return {
        "status": "available",
        "competence": _selected_competence(selected),
        "files": [
            {
                "name": str(item["name"]),
                "group": _optional_text(item.get("group")).upper(),
                "state": _optional_text(item.get("state")).upper(),
                "year": int(item["year"]),
                "month": int(item["month"]),
                "size": item.get("size"),
                "modified": _optional_text(item.get("modified")),
            }
            for item in selected
        ],
    }


def _metadata_matches_existing(existing: Mapping[str, Any] | None, selected: Sequence[Mapping[str, Any]]) -> bool:
    """Avoid downloads only when filename, size and remote modification match."""

    if not existing:
        return False
    stored_groups = existing.get("groups", {})
    for item in selected:
        group = _optional_text(item.get("group")).upper()
        stored = stored_groups.get(group, {})
        size, modified = item.get("size"), _optional_text(item.get("modified"))
        if size is None or not modified:
            return False
        if str(stored.get("filename")) != str(item.get("name")) or stored.get("size") != size or _optional_text(stored.get("modified")) != modified:
            return False
    return True


async def _download_selected_files(selected: Sequence[Mapping[str, Any]], private_root: Path) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    """Download the exact remote objects discovered from FTP, hash, then retain raw DBC."""

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    rows_by_group: dict[str, list[dict[str, Any]]] = {}
    sources: list[dict[str, Any]] = []
    competence = _selected_competence(selected)
    for selected_file in selected:
        group = _optional_text(selected_file.get("group")).upper()
        remote = selected_file.get("raw")
        if remote is None or not hasattr(remote, "download"):
            raise SnapshotValidationError(f"objeto remoto FTP inválido para {group}")
        filename = _as_text(selected_file.get("name"), "nome do arquivo")
        staging_path = private_root / "staging" / run_id / filename
        local = await remote.download(output=staging_path)
        local_path = Path(getattr(local, "path", staging_path))
        if not local_path.is_file():
            raise SnapshotValidationError(f"download FTP não materializou {filename}")
        table = await local.load()
        digest = _file_digest(local_path)
        raw_path = private_root / "raw" / competence / group / digest / filename
        if raw_path.exists():
            if _file_digest(raw_path) != digest:
                raise SnapshotValidationError(f"artefato bruto imutável diverge: {raw_path}")
            local_path.unlink(missing_ok=True)
        else:
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            os.replace(local_path, raw_path)
        rows_by_group[group] = _records(table)
        sources.append({"group": group, "filename": filename, "sha256": digest, "size": raw_path.stat().st_size, "modified": _optional_text(selected_file.get("modified"))})
    return rows_by_group, sources


async def _fetch_or_reuse_from_ftp(competence: str | None, private_root: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    _configure_pysus_cache(private_root)
    try:
        from pysus.api.ftp.client import FTP
    except ImportError as error:
        raise RuntimeError("PySUS 2.11.2 não está instalado; instale workers/cnes-sync/requirements.txt") from error
    ftp = FTP()
    await ftp.connect()
    try:
        selected = await discover_cnes_files_from_client(ftp, competence)
        target = _selected_competence(selected)
        existing = _read_manifest(private_root).get("competencies", {}).get(target)
        if _metadata_matches_existing(existing, selected):
            snapshot_path = Path(existing["snapshot_path"])
            if snapshot_path.is_file():
                snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
                sources = [{"group": group, **details} for group, details in existing["groups"].items()]
                return snapshot, sources
        rows, sources = await _download_selected_files(selected, private_root)
        return normalize_tables(rows["ST"], rows["PF"], target), sources
    finally:
        close = getattr(ftp, "close", None)
        if close is not None:
            result = close()
            if hasattr(result, "__await__"):
                await result


def sync_competence(competence: str | None, private_root: Path, public_root: Path | None) -> dict[str, Any]:
    snapshot, sources = asyncio.run(_fetch_or_reuse_from_ftp(competence, private_root))
    return publish_snapshot(snapshot, sources, private_root, public_root)


def _month_range(start: str, end: str) -> list[str]:
    start, end = _competence(start), _competence(end)
    if start > end:
        raise SnapshotValidationError("intervalo de backfill inválido")
    year, month = int(start[:4]), int(start[4:])
    result: list[str] = []
    while f"{year:04d}{month:02d}" <= end:
        result.append(f"{year:04d}{month:02d}")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return result


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sincroniza snapshots CNES ST/PF de Bacabal-MA (210120).")
    parser.add_argument("--private-root", type=Path, default=DEFAULT_PRIVATE_ROOT)
    parser.add_argument("--public-root", type=Path, default=DEFAULT_PUBLIC_ROOT)
    commands = parser.add_subparsers(dest="command", required=True)
    check = commands.add_parser("check", help="descobre ST/PF no FTP sem publicar")
    check.add_argument("competence", nargs="?", help="AAAAMM; omita para a última competência completa")
    sync = commands.add_parser("sync", help="baixa, valida e publica uma competência")
    sync.add_argument("competence", nargs="?", help="AAAAMM; omita para a última competência completa")
    backfill = commands.add_parser("backfill", help="sincroniza uma faixa inclusiva de competências")
    backfill.add_argument("start")
    backfill.add_argument("end")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        if args.command == "check":
            result: Any = _check_result(asyncio.run(discover_cnes_files_from_ftp(args.competence, args.private_root)))
        elif args.command == "sync":
            result = sync_competence(args.competence, args.private_root, args.public_root)
        else:
            result = [{"competence": competence, **sync_competence(competence, args.private_root, args.public_root)} for competence in _month_range(args.start, args.end)]
    except (RuntimeError, SnapshotValidationError) as error:
        print(json.dumps({"status": "failed", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
