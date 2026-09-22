-- =========================================================
-- ARGOS v9 — ENVIO PERMANENTE BPA + ESPELHO NA NUVEM
-- Idempotente: só IF NOT EXISTS / OR REPLACE. Rodar no SQL Editor.
-- =========================================================

ALTER TABLE public.producoes_bpa ADD COLUMN IF NOT EXISTS status_auditoria VARCHAR(50);
ALTER TABLE public.producoes_bpa ADD COLUMN IF NOT EXISTS total_apontamentos INTEGER DEFAULT 0;
ALTER TABLE public.producoes_bpa ADD COLUMN IF NOT EXISTS auditado_em TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.producoes_bpa ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_producoes_bpa_fingerprint ON public.producoes_bpa(fingerprint);

CREATE TABLE IF NOT EXISTS public.espelho_producao_profissional (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    producao_id UUID REFERENCES public.producoes_bpa(id) ON DELETE CASCADE,
    cnes VARCHAR(20),
    competencia VARCHAR(20) NOT NULL,
    cns_profissional VARCHAR(255),
    nome_profissional VARCHAR(255),
    cbo VARCHAR(10),
    procedimentos JSONB DEFAULT '[]',
    total_quantidade INTEGER DEFAULT 0,
    total_atendimentos INTEGER DEFAULT 0,
    total_valor NUMERIC(12,2),
    digitador_username VARCHAR(255),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_espelho_comp ON public.espelho_producao_profissional(competencia);
CREATE INDEX IF NOT EXISTS idx_espelho_cns ON public.espelho_producao_profissional(cns_profissional);
CREATE INDEX IF NOT EXISTS idx_espelho_prod ON public.espelho_producao_profissional(producao_id);

ALTER TABLE public.espelho_producao_profissional ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura de espelho" ON public.espelho_producao_profissional;
CREATE POLICY "Permitir leitura de espelho" ON public.espelho_producao_profissional FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Permitir insercao de espelho" ON public.espelho_producao_profissional;
CREATE POLICY "Permitir insercao de espelho" ON public.espelho_producao_profissional FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Permitir update de espelho" ON public.espelho_producao_profissional;
CREATE POLICY "Permitir update de espelho" ON public.espelho_producao_profissional FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS "Permitir exclusao de espelho" ON public.espelho_producao_profissional;
CREATE POLICY "Permitir exclusao de espelho" ON public.espelho_producao_profissional FOR DELETE TO anon USING (true);

CREATE OR REPLACE FUNCTION public.fn_listar_producoes_bpa(p_competencia TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(json_build_object(
        'id', p.id,
        'nome_arquivo', p.nome_arquivo,
        'estabelecimento_nome', p.estabelecimento_nome,
        'cnes', p.cnes,
        'competencia', p.competencia,
        'tipo_bpa', p.tipo_bpa,
        'tamanho_bytes', p.tamanho_bytes,
        'tamanho_formatado', p.tamanho_formatado,
        'digitador_username', p.digitador_username,
        'digitador_nome', p.digitador_nome,
        'observacoes', p.observacoes,
        'status', p.status,
        'status_auditoria', p.status_auditoria,
        'total_apontamentos', p.total_apontamentos,
        'auditado_em', p.auditado_em,
        'fingerprint', p.fingerprint,
        'criado_em', p.criado_em
    ) ORDER BY p.criado_em DESC) INTO v_result
    FROM public.producoes_bpa p
    WHERE (p_competencia IS NULL OR p.competencia = p_competencia);

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
