-- =========================================================
-- ARGOS FPA — SCRIPT DE BANCO DE DADOS (SUPABASE / POSTGRES)
-- Copie e cole este script no SQL Editor do seu projeto Supabase
-- =========================================================

-- 1. Tabela de Unidades de Saúde
CREATE TABLE IF NOT EXISTS public.unidades (
    cnes VARCHAR(10) PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(100) DEFAULT 'Unidade'
);

-- 2. Tabela de Procedimentos (SIGTAP)
CREATE TABLE IF NOT EXISTS public.procedimentos (
    codigo VARCHAR(10) PRIMARY KEY,
    descricao VARCHAR(255) NOT NULL,
    valor_unitario NUMERIC(12, 2) DEFAULT 0.00
);

-- 3. Tabela de CBOs (Ocupações de Profissionais)
CREATE TABLE IF NOT EXISTS public.cbos (
    codigo VARCHAR(6) PRIMARY KEY,
    descricao VARCHAR(255) NOT NULL
);

-- 4. Tabela Fato: Linhas de Faturamento SIA/SUS
CREATE TABLE IF NOT EXISTS public.faturamento_linhas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    competencia VARCHAR(7) NOT NULL, -- formato 'MM/AAAA'
    ano INTEGER NOT NULL,
    mes VARCHAR(2) NOT NULL,
    unidade_cnes VARCHAR(10) REFERENCES public.unidades(cnes) ON DELETE CASCADE,
    procedimento_codigo VARCHAR(10),
    cbo_codigo VARCHAR(6),
    qtd_apresentada INTEGER DEFAULT 0,
    qtd_aprovada INTEGER DEFAULT 0,
    qtd_glosada INTEGER DEFAULT 0,
    val_apresentado NUMERIC(12, 2) DEFAULT 0.00,
    val_aprovado NUMERIC(12, 2) DEFAULT 0.00,
    val_glosado NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Índices de Performance Analítica (Essenciais para Filtros Rápidos)
CREATE INDEX IF NOT EXISTS idx_fat_linhas_competencia ON public.faturamento_linhas(competencia);
CREATE INDEX IF NOT EXISTS idx_fat_linhas_unidade ON public.faturamento_linhas(unidade_cnes);
CREATE INDEX IF NOT EXISTS idx_fat_linhas_proc ON public.faturamento_linhas(procedimento_codigo);
CREATE INDEX IF NOT EXISTS idx_fat_linhas_cbo ON public.faturamento_linhas(cbo_codigo);

-- 6. Habilitar Realtime (Opcional)
ALTER PUBLICATION supabase_realtime ADD TABLE public.faturamento_linhas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.unidades;
