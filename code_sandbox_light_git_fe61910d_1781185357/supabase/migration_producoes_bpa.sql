-- =========================================================
-- ARGOS — MÓDULO PRODUÇÕES BPA
-- Tabela e RPCs para controle de envio e download de arquivos BPA
-- =========================================================

CREATE TABLE IF NOT EXISTS public.producoes_bpa (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    municipio_id UUID REFERENCES public.municipios_sistema(id) ON DELETE SET NULL,
    municipio_nome VARCHAR(150) DEFAULT 'Bacabal-MA',
    nome_arquivo VARCHAR(255) NOT NULL,
    estabelecimento_nome VARCHAR(255) NOT NULL,
    cnes VARCHAR(20),
    competencia VARCHAR(20) NOT NULL, -- ex: '07/2026'
    tipo_bpa VARCHAR(50) DEFAULT 'BPA-C', -- 'BPA-C' ou 'BPA-I'
    tamanho_bytes BIGINT NOT NULL DEFAULT 0,
    tamanho_formatado VARCHAR(50) NOT NULL DEFAULT '0 KB',
    conteudo_arquivo TEXT NOT NULL,
    digitador_username VARCHAR(255) NOT NULL,
    digitador_nome VARCHAR(255) NOT NULL,
    observacoes TEXT,
    status VARCHAR(50) DEFAULT 'ENVIADO', -- 'ENVIADO', 'BAIXADO', 'HOMOLOGADO'
    email_enviado_em TIMESTAMP WITH TIME ZONE,
    email_destinatario VARCHAR(255),
    email_status VARCHAR(50) DEFAULT 'NAO_ENVIADO', -- 'NAO_ENVIADO', 'ENVIADO', 'ERRO'
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garantir adição de colunas se a tabela já existir previamente
ALTER TABLE public.producoes_bpa ADD COLUMN IF NOT EXISTS email_enviado_em TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.producoes_bpa ADD COLUMN IF NOT EXISTS email_destinatario VARCHAR(255);
ALTER TABLE public.producoes_bpa ADD COLUMN IF NOT EXISTS email_status VARCHAR(50) DEFAULT 'NAO_ENVIADO';

-- Índices para pesquisa e filtragem rápida
CREATE INDEX IF NOT EXISTS idx_producoes_bpa_comp ON public.producoes_bpa(competencia);
CREATE INDEX IF NOT EXISTS idx_producoes_bpa_estab ON public.producoes_bpa(estabelecimento_nome);
CREATE INDEX IF NOT EXISTS idx_producoes_bpa_cnes ON public.producoes_bpa(cnes);
CREATE INDEX IF NOT EXISTS idx_producoes_bpa_tipo ON public.producoes_bpa(tipo_bpa);
CREATE INDEX IF NOT EXISTS idx_producoes_bpa_digitador ON public.producoes_bpa(digitador_username);
CREATE INDEX IF NOT EXISTS idx_producoes_bpa_criado ON public.producoes_bpa(criado_em DESC);

-- Habilitar RLS
ALTER TABLE public.producoes_bpa ENABLE ROW LEVEL SECURITY;

-- Políticas para acesso anônimo com a anon key configurada no ARGOS
DROP POLICY IF EXISTS "Permitir leitura de producoes_bpa" ON public.producoes_bpa;
CREATE POLICY "Permitir leitura de producoes_bpa" ON public.producoes_bpa FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Permitir insercao de producoes_bpa" ON public.producoes_bpa;
CREATE POLICY "Permitir insercao de producoes_bpa" ON public.producoes_bpa FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir update de producoes_bpa" ON public.producoes_bpa;
CREATE POLICY "Permitir update de producoes_bpa" ON public.producoes_bpa FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS "Permitir exclusao de producoes_bpa" ON public.producoes_bpa;
CREATE POLICY "Permitir exclusao de producoes_bpa" ON public.producoes_bpa FOR DELETE TO anon USING (true);

-- Funções RPC auxiliares (caso use chamadas via RPC)
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
        'criado_em', p.criado_em
    ) ORDER BY p.criado_em DESC) INTO v_result
    FROM public.producoes_bpa p
    WHERE (p_competencia IS NULL OR p.competencia = p_competencia);

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
