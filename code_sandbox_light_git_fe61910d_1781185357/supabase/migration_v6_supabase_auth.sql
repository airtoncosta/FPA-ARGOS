-- =========================================================
-- ARGOS v6.0 — SUPABASE AUTH + PROFILES
-- Execute no SQL Editor do Supabase APÓS a migration v5
-- =========================================================

-- 1. CRIAR TABELA PROFILES (vinculada ao auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'GERENTE' NOT NULL,
    status VARCHAR(50) DEFAULT 'ATIVO' NOT NULL,
    acesso_multi_municipio BOOLEAN DEFAULT FALSE,
    municipio_vinculado VARCHAR(150) DEFAULT 'Bacabal-MA',
    perm_usuarios BOOLEAN DEFAULT FALSE,
    perm_importar BOOLEAN DEFAULT FALSE,
    perm_limpar_db BOOLEAN DEFAULT FALSE,
    perm_config_supabase BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 2. TRIGGER PARA AUTO-CRIAR PROFILE AO CRIAR USER NO AUTH
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, username, email, name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'username', NEW.email),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'name', 'Usuário'),
        COALESCE(NEW.raw_user_meta_data ->> 'role', 'GERENTE')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 3. FUNÇÃO PARA SINCRONIZAR USUÁRIOS LEGADOS PARA AUTH
CREATE OR REPLACE FUNCTION public.fn_sync_user_to_auth(p_username TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_user public.usuarios%ROWTYPE;
    v_auth_id UUID;
BEGIN
    SELECT * INTO v_user FROM public.usuarios WHERE username = p_username;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Usuário não encontrado.');
    END IF;

    -- Verificar se já existe no auth.users
    SELECT id INTO v_auth_id FROM auth.users WHERE email = v_user.email;
    
    IF v_auth_id IS NULL THEN
        -- Não podemos criar auth.users de dentro de uma função SQL diretamente,
        -- usar a Edge Function para isso.
        RETURN json_build_object('success', false, 'message', 'Use a Edge Function sign-in para migrar este usuário.');
    END IF;

    -- Garantir que o profile existe
    INSERT INTO public.profiles (id, username, email, name, role, status, 
        acesso_multi_municipio, municipio_vinculado,
        perm_usuarios, perm_importar, perm_limpar_db, perm_config_supabase)
    VALUES (v_auth_id, v_user.username, v_user.email, v_user.name, v_user.role, v_user.status,
        COALESCE(v_user.acesso_multi_municipio, FALSE),
        COALESCE(v_user.municipio_vinculado, 'Bacabal-MA'),
        COALESCE(v_user.perm_usuarios, FALSE),
        COALESCE(v_user.perm_importar, FALSE),
        COALESCE(v_user.perm_limpar_db, FALSE),
        COALESCE(v_user.perm_config_supabase, FALSE))
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        acesso_multi_municipio = EXCLUDED.acesso_multi_municipio,
        municipio_vinculado = EXCLUDED.municipio_vinculado,
        perm_usuarios = EXCLUDED.perm_usuarios,
        perm_importar = EXCLUDED.perm_importar,
        perm_limpar_db = EXCLUDED.perm_limpar_db,
        perm_config_supabase = EXCLUDED.perm_config_supabase;

    RETURN json_build_object('success', true, 'auth_id', v_auth_id);
END;
$$;

-- 4. ATUALIZAR RLS PARA AS TABELAS USANDO AUTH.UID()
-- Remover políticas antigas das tabelas multi-município
DROP POLICY IF EXISTS "Permitir leitura de municipios" ON public.municipios_sistema;
DROP POLICY IF EXISTS "Permitir escrita de municipios via function" ON public.municipios_sistema;
DROP POLICY IF EXISTS "Permitir leitura de logomarcas" ON public.logomarcas_municipio;
DROP POLICY IF EXISTS "Permitir acesso total a logomarcas via function" ON public.logomarcas_municipio;
DROP POLICY IF EXISTS "Permitir leitura de producao" ON public.producao_sia;
DROP POLICY IF EXISTS "Permitir acesso total a producao via function" ON public.producao_sia;

-- Remover políticas antigas do schema base
DROP POLICY IF EXISTS "Permitir leitura de procedimentos" ON public.procedimentos;
DROP POLICY IF EXISTS "Permitir escrita de procedimentos via function" ON public.procedimentos;
DROP POLICY IF EXISTS "Permitir leitura de usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Permitir escrita de usuarios via function" ON public.usuarios;
DROP POLICY IF EXISTS "Permitir leitura de historico" ON public.historico_acoes;
DROP POLICY IF EXISTS "Permitir insercao de historico" ON public.historico_acoes;
DROP POLICY IF EXISTS "Permitir leitura de configuracoes" ON public.configuracoes;
DROP POLICY IF EXISTS "Permitir escrita de configuracoes via function" ON public.configuracoes;

-- RLS PARA PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas baseadas em auth.uid() e role do JWT
-- Procedimentos: leitura para todos autenticados, escrita só para ADM
CREATE POLICY "Procedimentos leitura autenticados" 
ON public.procedimentos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Procedimentos escrita ADM" 
ON public.procedimentos FOR ALL TO authenticated 
USING ((auth.jwt() ->> 'role') = 'ADM' OR (auth.jwt() ->> 'role') = 'SUPERINTENDENTE')
WITH CHECK ((auth.jwt() ->> 'role') = 'ADM' OR (auth.jwt() ->> 'role') = 'SUPERINTENDENTE');

-- Profiles: cada um vê o próprio, ADM vê todos
CREATE POLICY "Profiles leitura propria" 
ON public.profiles FOR SELECT TO authenticated 
USING (id = auth.uid() OR (auth.jwt() ->> 'role') IN ('ADM', 'SUPERINTENDENTE'));

CREATE POLICY "Profiles escrita ADM" 
ON public.profiles FOR ALL TO authenticated 
USING ((auth.jwt() ->> 'role') = 'ADM')
WITH CHECK ((auth.jwt() ->> 'role') = 'ADM');

-- Usuários (legado): leitura autenticada, escrita ADM
CREATE POLICY "Usuarios leitura autenticados" 
ON public.usuarios FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuarios escrita ADM" 
ON public.usuarios FOR ALL TO authenticated 
USING ((auth.jwt() ->> 'role') = 'ADM')
WITH CHECK ((auth.jwt() ->> 'role') = 'ADM');

-- Histórico: leitura autenticada, inserção autenticada
CREATE POLICY "Historico leitura autenticados" 
ON public.historico_acoes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Historico insercao autenticados" 
ON public.historico_acoes FOR INSERT TO authenticated WITH CHECK (true);

-- Configurações: leitura autenticada, escrita ADM
CREATE POLICY "Configuracoes leitura autenticados" 
ON public.configuracoes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Configuracoes escrita ADM" 
ON public.configuracoes FOR ALL TO authenticated 
USING ((auth.jwt() ->> 'role') = 'ADM')
WITH CHECK ((auth.jwt() ->> 'role') = 'ADM');

-- Municipios: leitura autenticada, escrita autenticada (qualquer user logado pode criar)
CREATE POLICY "Municipios leitura autenticados" 
ON public.municipios_sistema FOR SELECT TO authenticated USING (true);

CREATE POLICY "Municipios escrita autenticados" 
ON public.municipios_sistema FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Logomarcas: leitura autenticada, escrita autenticada
CREATE POLICY "Logomarcas leitura autenticados" 
ON public.logomarcas_municipio FOR SELECT TO authenticated USING (true);

CREATE POLICY "Logomarcas escrita autenticados" 
ON public.logomarcas_municipio FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Producao SIA: leitura autenticada, escrita autenticada
CREATE POLICY "Producao leitura autenticados" 
ON public.producao_sia FOR SELECT TO authenticated USING (true);

CREATE POLICY "Producao escrita autenticados" 
ON public.producao_sia FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. FUNÇÃO PARA ATUALIZAR TENTATIVAS FALHAS
CREATE OR REPLACE FUNCTION public.fn_update_failed_attempts(p_username TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    UPDATE public.usuarios SET failed_attempts = COALESCE(failed_attempts, 0) + 1 WHERE username = p_username;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_update_failed_attempts TO anon;
GRANT EXECUTE ON FUNCTION public.fn_sync_user_to_auth TO anon;

-- 6. POLÍTICA PARA ANON (mínimo necessário para login funcionar)
-- Anon só pode chamar as RPC functions, não as tabelas diretamente
-- Já está configurado nas migrations anteriores
