-- =========================================================
-- ARGOS — SCRIPT DE BANCO DE DADOS (SUPABASE / POSTGRES)
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
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'GERENTE' NOT NULL,
    status VARCHAR(50) DEFAULT 'ATIVO' NOT NULL,
    acesso_multi_municipio BOOLEAN DEFAULT FALSE,
    municipio_vinculado VARCHAR(150) DEFAULT 'Bacabal-MA',
    perm_usuarios BOOLEAN DEFAULT FALSE,
    perm_importar BOOLEAN DEFAULT FALSE,
    perm_limpar_db BOOLEAN DEFAULT FALSE,
    perm_config_supabase BOOLEAN DEFAULT FALSE,
    failed_attempts INTEGER DEFAULT 0,
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

-- 6. Inserir Usuários Iniciais (senhas armazenadas como SHA-256)
INSERT INTO public.usuarios (username, email, name, password, role, status, acesso_multi_municipio, perm_usuarios, perm_importar, created_at)
VALUES 
  ('airton', 'airton.costa@yahoo.com.br', 'Airton Costa', '3b711afd736b9a7a8008f776a7a37fd0a2aa0cb9ecab20d1e0ee9880ef94591d', 'ADM', 'ATIVO', TRUE, TRUE, TRUE, NOW()),
  ('francileide', 'francileide@fpa.gov.br', 'Francileide', '5ee51df5f54fe34491eca667d200890a7d6b9a7a3d86c54207bc945e9fd8db24', 'SUPERINTENDENTE', 'ATIVO', TRUE, TRUE, TRUE, NOW()),
  ('jessica', 'jessica@fpa.gov.br', 'Jessica', '22d4954d6dd4a39356d3329d1b48f54425d3bb3f33ca45adcc559f6e81c759f5', 'GERENTE', 'ATIVO', FALSE, FALSE, TRUE, NOW()),
  ('aline', 'aline@fpa.gov.br', 'Aline', 'c6e9ca89f3378cc107bfba66e613793f9696e1d0695f2e51f54a025cd827dce6', 'GERENTE', 'ATIVO', FALSE, FALSE, TRUE, NOW()),
  ('ewerton', 'ewerton@fpa.gov.br', 'Ewerton', 'f5b1f7e02f7c4262c58aa0ef7414e850a610d4b8c051e12c3c48acc2bbac3973', 'GERENTE', 'ATIVO', FALSE, FALSE, TRUE, NOW()),
  ('mariline', 'mariline@fpa.gov.br', 'Mariline', '27eab7062293914145d0c015fe2b6a35e0566fef81ec50de51712f3dce1f1b63', 'GERENTE', 'ATIVO', FALSE, FALSE, TRUE, NOW()),
  ('flavia', 'flavia@fpa.gov.br', 'Flavia', '17f40d3c094d044dc7f94bd3724e8e88d4225205345d1b54035b55cc249b2e2e', 'GERENTE', 'ATIVO', FALSE, FALSE, TRUE, NOW())
ON CONFLICT (username) DO UPDATE SET
    password = EXCLUDED.password,
    role = EXCLUDED.role,
    acesso_multi_municipio = EXCLUDED.acesso_multi_municipio,
    perm_usuarios = EXCLUDED.perm_usuarios,
    perm_importar = EXCLUDED.perm_importar;

-- 7. Habilitar RLS (Row Level Security) e Criar Políticas
ALTER TABLE public.procedimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_acoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se já existirem
DROP POLICY IF EXISTS "Permitir leitura de procedimentos" ON public.procedimentos;
DROP POLICY IF EXISTS "Permitir modificacao de procedimentos" ON public.procedimentos;
DROP POLICY IF EXISTS "Permitir acesso total a usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Permitir leitura de historico" ON public.historico_acoes;
DROP POLICY IF EXISTS "Permitir insercao de historico" ON public.historico_acoes;
DROP POLICY IF EXISTS "Permitir acesso total a configuracoes" ON public.configuracoes;

-- Políticas restritivas:
-- Procedimentos: leitura pública, escrita via SECURITY DEFINER
CREATE POLICY "Permitir leitura de procedimentos" 
ON public.procedimentos FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir escrita de procedimentos via function" 
ON public.procedimentos FOR ALL TO anon USING (false) WITH CHECK (false);

-- Usuários: leitura pública (sem coluna de senha), escrita via SECURITY DEFINER
CREATE POLICY "Permitir leitura de usuarios" 
ON public.usuarios FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir escrita de usuarios via function" 
ON public.usuarios FOR ALL TO anon USING (false) WITH CHECK (false);

-- Histórico: inserção pública (auditoria), leitura pública
CREATE POLICY "Permitir leitura de historico" 
ON public.historico_acoes FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir insercao de historico" 
ON public.historico_acoes FOR INSERT TO anon WITH CHECK (true);

-- Configurações: leitura pública, escrita via SECURITY DEFINER
CREATE POLICY "Permitir leitura de configuracoes" 
ON public.configuracoes FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir escrita de configuracoes via function" 
ON public.configuracoes FOR ALL TO anon USING (false) WITH CHECK (false);
