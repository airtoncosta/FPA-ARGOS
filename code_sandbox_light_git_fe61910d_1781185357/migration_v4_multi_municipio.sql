-- =========================================================
-- ARGOS FPA v4.0 — MULTI-MUNICÍPIO
-- Execute este script no SQL Editor do Supabase
-- =========================================================

-- 1. Catálogo de municípios atendidos pelo sistema
--    Alimentado automaticamente a cada TXT importado com sucesso,
--    ou manualmente ao cadastrar uma logomarca antes de importar dados.
CREATE TABLE IF NOT EXISTS public.municipios_sistema (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    uf VARCHAR(2) NOT NULL,
    nome VARCHAR(150) NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(uf, nome)
);

-- 2. Logomarca vinculada a cada município (substitui a logo global única)
CREATE TABLE IF NOT EXISTS public.logomarcas_municipio (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    municipio_id UUID NOT NULL REFERENCES public.municipios_sistema(id) ON DELETE CASCADE,
    logo_base64 TEXT NOT NULL,
    ativa BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Dados de produção SIA/SUS por município/competência
--    Substitui o IndexedDB como fonte única de verdade. IndexedDB passa a ser cache local.
CREATE TABLE IF NOT EXISTS public.producao_sia (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    municipio_id UUID NOT NULL REFERENCES public.municipios_sistema(id) ON DELETE CASCADE,
    competencia VARCHAR(20) NOT NULL,
    nome_arquivo VARCHAR(255),
    dados_json JSONB NOT NULL,
    importado_por VARCHAR(255),
    importado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(municipio_id, competencia)
);

-- 4. Controle de acesso multi-município no cadastro de usuários
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS acesso_multi_municipio BOOLEAN DEFAULT FALSE;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS municipio_vinculado VARCHAR(150) DEFAULT 'Bacabal-MA';

-- Conceder visibilidade ampliada para os dois usuários definidos pelo produto
UPDATE public.usuarios SET acesso_multi_municipio = TRUE WHERE username IN ('airton', 'francileide');

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_producao_municipio ON public.producao_sia(municipio_id);
CREATE INDEX IF NOT EXISTS idx_logo_municipio ON public.logomarcas_municipio(municipio_id);

-- 6. RLS (mesmo padrão "anon" já usado no restante do schema)
ALTER TABLE public.municipios_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logomarcas_municipio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producao_sia ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Permitir leitura de municipios" ON public.municipios_sistema;
DROP POLICY IF EXISTS "Permitir escrita de municipios" ON public.municipios_sistema;
DROP POLICY IF EXISTS "Permitir acesso total a logomarcas" ON public.logomarcas_municipio;
DROP POLICY IF EXISTS "Permitir acesso total a producao" ON public.producao_sia;

-- Criar políticas
CREATE POLICY "Permitir leitura de municipios" ON public.municipios_sistema FOR SELECT TO anon USING (true);
CREATE POLICY "Permitir escrita de municipios" ON public.municipios_sistema FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Permitir acesso total a logomarcas" ON public.logomarcas_municipio FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total a producao" ON public.producao_sia FOR ALL TO anon USING (true) WITH CHECK (true);
