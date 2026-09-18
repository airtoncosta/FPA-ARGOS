-- CNES ST/PF: historico imutavel e cifrado. Execute no SQL Editor antes do upload.
-- Nao armazena CNS, nomes ou vinculos em texto claro neste esquema.
CREATE TABLE IF NOT EXISTS public.cnes_snapshot_versions (
    municipio_ibge char(6) NOT NULL,
    competencia char(6) NOT NULL,
    revisao integer NOT NULL CHECK (revisao > 0),
    blob_sha256 char(64) NOT NULL,
    source_sha256 char(64) NOT NULL,
    envelope jsonb NOT NULL,
    contagens jsonb NOT NULL,
    cobertura jsonb NOT NULL,
    fonte text NOT NULL,
    publicado_em timestamptz NOT NULL,
    carregado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (municipio_ibge, competencia, revisao),
    CHECK (municipio_ibge ~ '^[0-9]{6}$'),
    CHECK (competencia ~ '^20[0-9]{4}$'),
    CHECK (blob_sha256 ~ '^[0-9a-f]{64}$'),
    CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
    CHECK (envelope ->> 'algorithm' = 'aes-256-gcm')
);

ALTER TABLE public.cnes_snapshot_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cnes_snapshot_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.cnes_snapshot_versions TO service_role;

-- Mesmo service_role nao pode corrigir uma revisao in-place: publique outra revisao.
CREATE OR REPLACE FUNCTION public.fn_cnes_snapshot_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'CNES snapshot e imutavel; publique nova revisao';
END;
$$;

DROP TRIGGER IF EXISTS trg_cnes_snapshot_immutable ON public.cnes_snapshot_versions;
CREATE TRIGGER trg_cnes_snapshot_immutable
BEFORE UPDATE OR DELETE ON public.cnes_snapshot_versions
FOR EACH ROW EXECUTE FUNCTION public.fn_cnes_snapshot_immutable();
