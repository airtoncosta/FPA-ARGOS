-- =========================================================
-- ARGOS — MÓDULO CNES & MOVIMENTAÇÕES MENSAIS
-- Tabelas para Estabelecimentos, Profissionais e Auditoria de Vínculos
-- Copie e cole este script no SQL Editor do seu projeto Supabase
-- =========================================================

-- 1. Tabela de Estabelecimentos de Saúde (CNES)
CREATE TABLE IF NOT EXISTS public.cnes_estabelecimentos (
    cnes VARCHAR(20) NOT NULL,
    competencia VARCHAR(10) NOT NULL, -- ex: '202608'
    codigo_ibge VARCHAR(10) NOT NULL DEFAULT '210120',
    municipio VARCHAR(150) NOT NULL DEFAULT 'BACABAL',
    uf VARCHAR(2) NOT NULL DEFAULT 'MA',
    nome_fantasia VARCHAR(255) NOT NULL,
    razao_social VARCHAR(255) NOT NULL,
    tipo_unidade VARCHAR(255),
    tipo_gestao VARCHAR(50) DEFAULT 'MUNICIPAL',
    esfera VARCHAR(50) DEFAULT 'MUNICIPAL',
    cnpj VARCHAR(30),
    atendimento_sus VARCHAR(20) DEFAULT 'SIM',
    endereco VARCHAR(255),
    bairro VARCHAR(100),
    cep VARCHAR(20),
    telefone VARCHAR(50),
    dados JSONB DEFAULT '{}'::jsonb,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (cnes, competencia)
);

-- 2. Tabela de Profissionais e Vínculos de Saúde
CREATE TABLE IF NOT EXISTS public.cnes_profissionais (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cnes VARCHAR(20) NOT NULL,
    competencia VARCHAR(10) NOT NULL, -- ex: '202608'
    municipio_ibge VARCHAR(10) NOT NULL DEFAULT '210120',
    cns VARCHAR(20) NOT NULL,
    cbo VARCHAR(10) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    ocupacao VARCHAR(255) NOT NULL,
    ch_amb INTEGER DEFAULT 0,
    ch_hosp INTEGER DEFAULT 0,
    ch_outros INTEGER DEFAULT 0,
    ch_total INTEGER DEFAULT 0,
    atendimento_sus VARCHAR(10) DEFAULT 'SIM',
    vinculacao VARCHAR(100) DEFAULT 'VINCULO EMPREGATICIO',
    tipo_vinculo VARCHAR(100) DEFAULT 'CONTRATADO TEMPORÁRIO',
    subtipo VARCHAR(100) DEFAULT 'PUBLICO',
    situacao VARCHAR(50) DEFAULT 'Ativo',
    portaria134 VARCHAR(50),
    dt_atribuicao VARCHAR(50),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT cnes_prof_comp_unique UNIQUE (cnes, cns, cbo, competencia)
);

-- 3. Tabela de Movimentações Mensais (Entradas, Saídas e Alterações de Carga Horária)
CREATE TABLE IF NOT EXISTS public.cnes_movimentacoes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    municipio_ibge VARCHAR(10) NOT NULL DEFAULT '210120',
    competencia_anterior VARCHAR(10) NOT NULL,
    competencia_atual VARCHAR(10) NOT NULL,
    tipo_movimento VARCHAR(50) NOT NULL, -- 'ENTRADA', 'SAIDA', 'ALTERACAO_CH', 'SOBREPOSICAO'
    cnes VARCHAR(20) NOT NULL,
    estabelecimento_nome VARCHAR(255) NOT NULL,
    cns VARCHAR(20) NOT NULL,
    cbo VARCHAR(10) NOT NULL,
    profissional_nome VARCHAR(255) NOT NULL,
    ocupacao VARCHAR(255) NOT NULL,
    ch_anterior INTEGER,
    ch_atual INTEGER,
    ch_diferenca INTEGER,
    portaria134_alerta VARCHAR(100),
    detalhes JSONB DEFAULT '{}'::jsonb,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Índices para Otimização de Consultas Rápidas
CREATE INDEX IF NOT EXISTS idx_cnes_estab_ibge ON public.cnes_estabelecimentos(codigo_ibge, competencia);
CREATE INDEX IF NOT EXISTS idx_cnes_estab_cnes ON public.cnes_estabelecimentos(cnes);
CREATE INDEX IF NOT EXISTS idx_cnes_prof_cnes_comp ON public.cnes_profissionais(cnes, competencia);
CREATE INDEX IF NOT EXISTS idx_cnes_prof_cns ON public.cnes_profissionais(cns);
CREATE INDEX IF NOT EXISTS idx_cnes_prof_cbo ON public.cnes_profissionais(cbo);
CREATE INDEX IF NOT EXISTS idx_cnes_prof_ibge ON public.cnes_profissionais(municipio_ibge, competencia);
CREATE INDEX IF NOT EXISTS idx_cnes_mov_comp ON public.cnes_movimentacoes(competencia_atual, competencia_anterior);
CREATE INDEX IF NOT EXISTS idx_cnes_mov_tipo ON public.cnes_movimentacoes(tipo_movimento);
CREATE INDEX IF NOT EXISTS idx_cnes_mov_cnes ON public.cnes_movimentacoes(cnes);

-- 5. Habilitar RLS (Row Level Security)
ALTER TABLE public.cnes_estabelecimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cnes_profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cnes_movimentacoes ENABLE ROW LEVEL SECURITY;

-- 6. Políticas de Acesso via Anon Key (Leitura e Gravação para o ARGOS)
DROP POLICY IF EXISTS "Permitir leitura de cnes_estabelecimentos" ON public.cnes_estabelecimentos;
CREATE POLICY "Permitir leitura de cnes_estabelecimentos" ON public.cnes_estabelecimentos FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Permitir escrita de cnes_estabelecimentos" ON public.cnes_estabelecimentos;
CREATE POLICY "Permitir escrita de cnes_estabelecimentos" ON public.cnes_estabelecimentos FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leitura de cnes_profissionais" ON public.cnes_profissionais;
CREATE POLICY "Permitir leitura de cnes_profissionais" ON public.cnes_profissionais FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Permitir escrita de cnes_profissionais" ON public.cnes_profissionais;
CREATE POLICY "Permitir escrita de cnes_profissionais" ON public.cnes_profissionais FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leitura de cnes_movimentacoes" ON public.cnes_movimentacoes;
CREATE POLICY "Permitir leitura de cnes_movimentacoes" ON public.cnes_movimentacoes FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Permitir escrita de cnes_movimentacoes" ON public.cnes_movimentacoes;
CREATE POLICY "Permitir escrita de cnes_movimentacoes" ON public.cnes_movimentacoes FOR ALL TO anon USING (true) WITH CHECK (true);

-- 7. Função RPC para consulta paginada e rápida de estabelecimentos com contagem de profissionais
CREATE OR REPLACE FUNCTION public.fn_listar_cnes_resumo(p_ibge TEXT DEFAULT '210120', p_competencia TEXT DEFAULT '202608')
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(json_build_object(
        'cnes', e.cnes,
        'nomeFantasia', e.nome_fantasia,
        'razaoSocial', e.razao_social,
        'tipoUnidade', e.tipo_unidade,
        'tipoGestao', e.tipo_gestao,
        'esfera', e.esfera,
        'atendimentoSus', e.atendimento_sus,
        'endereco', e.endereco,
        'bairro', e.bairro,
        'telefone', e.telefone,
        'competencia', e.competencia,
        'totalProfissionais', (SELECT COUNT(*) FROM public.cnes_profissionais p WHERE p.cnes = e.cnes AND p.competencia = e.competencia)
    ) ORDER BY e.nome_fantasia) INTO v_result
    FROM public.cnes_estabelecimentos e
    WHERE e.codigo_ibge = p_ibge AND e.competencia = p_competencia;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_listar_cnes_resumo(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_listar_cnes_resumo(TEXT, TEXT) TO authenticated;
