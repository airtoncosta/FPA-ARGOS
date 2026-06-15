-- =========================================================
-- ARGOS FPA — SCRIPT DE BANCO DE DADOS (SUPABASE / POSTGRES)
-- Copie e cole este script no SQL Editor do seu projeto Supabase
-- =========================================================

-- 1. Tabela de Procedimentos (SIGTAP)
CREATE TABLE IF NOT EXISTS public.procedimentos (
    codigo VARCHAR(10) PRIMARY KEY,
    descricao VARCHAR(255) NOT NULL,
    valor_unitario NUMERIC(12, 2) DEFAULT 0.00
);

-- 2. Tabela de Usuários (Autenticação do Sistema)
CREATE TABLE IF NOT EXISTS public.usuarios (
    username VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL, -- Senha simulada em texto puro
    role VARCHAR(50) DEFAULT 'GERENTE' NOT NULL, -- 'ADM' ou 'GERENTE'
    status VARCHAR(50) DEFAULT 'ATIVO' NOT NULL, -- 'ATIVO', 'BLOQUEADO', 'INATIVO'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabela de Histórico de Ações (Auditoria de Eventos)
CREATE TABLE IF NOT EXISTS public.historico_acoes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    usuario_login VARCHAR(255) NOT NULL,
    acao VARCHAR(100) NOT NULL,
    modulo VARCHAR(100) NOT NULL,
    descricao TEXT
);

-- 4. Tabela de Configurações Gerais (ex: Logomarca do PDF em Base64)
CREATE TABLE IF NOT EXISTS public.configuracoes (
    chave VARCHAR(100) PRIMARY KEY,
    valor TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Índices para Otimização de Performance
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON public.usuarios(email);
CREATE INDEX IF NOT EXISTS idx_hist_usuario ON public.historico_acoes(usuario_login);
CREATE INDEX IF NOT EXISTS idx_hist_criado ON public.historico_acoes(created_at DESC);

-- 6. Inserir Usuários Iniciais Padrão (Sem sobrescrever caso já existam)
INSERT INTO public.usuarios (username, email, name, password, role, status, created_at)
VALUES 
  ('airton', 'airton.costa@yahoo.com.br', 'Airton Costa', 'airton@2026', 'ADM', 'ATIVO', NOW()),
  ('francileide', 'francileide@fpa.gov.br', 'Francileide', 'francileide@2026', 'GERENTE', 'ATIVO', NOW()),
  ('jessica', 'jessica@fpa.gov.br', 'Jessica', 'jessica@2026', 'GERENTE', 'ATIVO', NOW()),
  ('aline', 'aline@fpa.gov.br', 'Aline', 'aline@2026', 'GERENTE', 'ATIVO', NOW()),
  ('ewerton', 'ewerton@fpa.gov.br', 'Ewerton', 'ewerton@2026', 'GERENTE', 'ATIVO', NOW()),
  ('mariline', 'mariline@fpa.gov.br', 'Mariline', 'mariline@2026', 'GERENTE', 'ATIVO', NOW()),
  ('flavia', 'flavia@fpa.gov.br', 'Flavia', 'flavia@2026', 'GERENTE', 'ATIVO', NOW())
ON CONFLICT (username) DO NOTHING;

-- 7. Habilitar RLS (Row Level Security) e Criar Políticas para Acesso via Anon Key
ALTER TABLE public.procedimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_acoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se já existirem (evita erro de duplicidade)
DROP POLICY IF EXISTS "Permitir leitura de procedimentos" ON public.procedimentos;
DROP POLICY IF EXISTS "Permitir modificacao de procedimentos" ON public.procedimentos;
DROP POLICY IF EXISTS "Permitir acesso total a usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Permitir leitura de historico" ON public.historico_acoes;
DROP POLICY IF EXISTS "Permitir insercao de historico" ON public.historico_acoes;
DROP POLICY IF EXISTS "Permitir acesso total a configuracoes" ON public.configuracoes;

-- Criar Políticas para Perfil Público (Role: anon)
CREATE POLICY "Permitir leitura de procedimentos" 
ON public.procedimentos FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir modificacao de procedimentos" 
ON public.procedimentos FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Permitir acesso total a usuarios" 
ON public.usuarios FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Permitir leitura de historico" 
ON public.historico_acoes FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir insercao de historico" 
ON public.historico_acoes FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Permitir acesso total a configuracoes" 
ON public.configuracoes FOR ALL TO anon USING (true) WITH CHECK (true);

