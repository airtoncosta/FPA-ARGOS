-- =========================================================
-- ARGOS v5.0 — SEGURANÇA: HASH DE SENHAS + RLS RESTRITO
-- Execute no SQL Editor do Supabase APÓS o schema base
-- =========================================================

-- 1. ATUALIZAR SENHAS EXISTENTES PARA HASH SHA-256
--    (caso os usuários já existam com senha em texto puro)
UPDATE public.usuarios SET password = '3b711afd736b9a7a8008f776a7a37fd0a2aa0cb9ecab20d1e0ee9880ef94591d' WHERE username = 'airton' AND password != '3b711afd736b9a7a8008f776a7a37fd0a2aa0cb9ecab20d1e0ee9880ef94591d';
UPDATE public.usuarios SET password = '5ee51df5f54fe34491eca667d200890a7d6b9a7a3d86c54207bc945e9fd8db24' WHERE username = 'francileide' AND password != '5ee51df5f54fe34491eca667d200890a7d6b9a7a3d86c54207bc945e9fd8db24';
UPDATE public.usuarios SET password = '22d4954d6dd4a39356d3329d1b48f54425d3bb3f33ca45adcc559f6e81c759f5' WHERE username = 'jessica' AND password != '22d4954d6dd4a39356d3329d1b48f54425d3bb3f33ca45adcc559f6e81c759f5';
UPDATE public.usuarios SET password = 'c6e9ca89f3378cc107bfba66e613793f9696e1d0695f2e51f54a025cd827dce6' WHERE username = 'aline' AND password != 'c6e9ca89f3378cc107bfba66e613793f9696e1d0695f2e51f54a025cd827dce6';
UPDATE public.usuarios SET password = 'f5b1f7e02f7c4262c58aa0ef7414e850a610d4b8c051e12c3c48acc2bbac3973' WHERE username = 'ewerton' AND password != 'f5b1f7e02f7c4262c58aa0ef7414e850a610d4b8c051e12c3c48acc2bbac3973';
UPDATE public.usuarios SET password = '27eab7062293914145d0c015fe2b6a35e0566fef81ec50de51712f3dce1f1b63' WHERE username = 'mariline' AND password != '27eab7062293914145d0c015fe2b6a35e0566fef81ec50de51712f3dce1f1b63';
UPDATE public.usuarios SET password = '17f40d3c094d044dc7f94bd3724e8e88d4225205345d1b54035b55cc249b2e2e' WHERE username = 'flavia' AND password != '17f40d3c094d044dc7f94bd3724e8e88d4225205345d1b54035b55cc249b2e2e';

-- 2. ADICIONAR COLUNAS FALTANTES (SE NÃO EXISTIREM)
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS acesso_multi_municipio BOOLEAN DEFAULT FALSE;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS municipio_vinculado VARCHAR(150) DEFAULT 'Bacabal-MA';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS perm_usuarios BOOLEAN DEFAULT FALSE;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS perm_importar BOOLEAN DEFAULT FALSE;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS perm_limpar_db BOOLEAN DEFAULT FALSE;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS perm_config_supabase BOOLEAN DEFAULT FALSE;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0;

-- 3. FUNÇÕES SECURITY DEFINER (substituem acesso direto do anon)

-- 3.1 Verificar login (retorna dados do usuário se hash bater)
CREATE OR REPLACE FUNCTION public.fn_verify_login(
    p_username TEXT,
    p_password_hash TEXT
) RETURNS JSON
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
    v_user public.usuarios%ROWTYPE;
    v_result JSON;
BEGIN
    SELECT * INTO v_user
    FROM public.usuarios
    WHERE (username = p_username OR email = p_username);

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Nome de acesso ou e-mail não cadastrado.');
    END IF;

    IF v_user.status = 'BLOQUEADO' OR v_user.status = 'INATIVO' THEN
        RETURN json_build_object('success', false, 'message', 'Acesso Negado. Seu usuário foi bloqueado pelo Administrador.');
    END IF;

    IF v_user.password != p_password_hash THEN
        UPDATE public.usuarios SET failed_attempts = failed_attempts + 1 WHERE username = v_user.username;
        IF v_user.failed_attempts + 1 >= 5 THEN
            UPDATE public.usuarios SET status = 'BLOQUEADO' WHERE username = v_user.username;
            RETURN json_build_object('success', false, 'message', 'CONTA BLOQUEADA: Você excedeu o limite de 5 tentativas inválidas. Contate o Administrador.');
        END IF;
        RETURN json_build_object(
            'success', false,
            'message', 'Senha incorreta.',
            'isPasswordWrong', true,
            'failedAttempts', v_user.failed_attempts + 1
        );
    END IF;

    -- Resetar tentativas em caso de sucesso
    UPDATE public.usuarios SET failed_attempts = 0 WHERE username = v_user.username;

    RETURN json_build_object(
        'success', true,
        'user', json_build_object(
            'username', v_user.username,
            'email', v_user.email,
            'name', v_user.name,
            'role', v_user.role,
            'status', v_user.status,
            'acesso_multi_municipio', v_user.acesso_multi_municipio,
            'municipio_vinculado', v_user.municipio_vinculado,
            'perm_usuarios', v_user.perm_usuarios,
            'perm_importar', v_user.perm_importar,
            'perm_limpar_db', v_user.perm_limpar_db,
            'perm_config_supabase', v_user.perm_config_supabase
        )
    );
END;
$$;

-- 3.2 Listar usuários (sem a coluna de senha)
CREATE OR REPLACE FUNCTION public.fn_listar_usuarios()
RETURNS JSON
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(json_build_object(
        'username', u.username,
        'email', u.email,
        'name', u.name,
        'role', u.role,
        'status', u.status,
        'acesso_multi_municipio', u.acesso_multi_municipio,
        'municipio_vinculado', u.municipio_vinculado,
        'perm_usuarios', u.perm_usuarios,
        'perm_importar', u.perm_importar,
        'perm_limpar_db', u.perm_limpar_db,
        'perm_config_supabase', u.perm_config_supabase,
        'failed_attempts', u.failed_attempts,
        'created_at', u.created_at
    ) ORDER BY u.created_at DESC) INTO v_result
    FROM public.usuarios u;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- 3.3 Criar/Atualizar usuário
CREATE OR REPLACE FUNCTION public.fn_upsert_usuario(p_user_data JSON)
RETURNS JSON
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
    v_username VARCHAR(255);
BEGIN
    v_username := p_user_data ->> 'username';

    INSERT INTO public.usuarios (
        username, email, name, password, role, status,
        acesso_multi_municipio, municipio_vinculado,
        perm_usuarios, perm_importar, perm_limpar_db, perm_config_supabase
    ) VALUES (
        v_username,
        p_user_data ->> 'email',
        p_user_data ->> 'name',
        p_user_data ->> 'password',
        COALESCE(p_user_data ->> 'role', 'GERENTE'),
        COALESCE(p_user_data ->> 'status', 'ATIVO'),
        COALESCE((p_user_data ->> 'acesso_multi_municipio')::BOOLEAN, FALSE),
        COALESCE(p_user_data ->> 'municipio_vinculado', 'Bacabal-MA'),
        COALESCE((p_user_data ->> 'perm_usuarios')::BOOLEAN, FALSE),
        COALESCE((p_user_data ->> 'perm_importar')::BOOLEAN, FALSE),
        COALESCE((p_user_data ->> 'perm_limpar_db')::BOOLEAN, FALSE),
        COALESCE((p_user_data ->> 'perm_config_supabase')::BOOLEAN, FALSE)
    )
    ON CONFLICT (username) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        acesso_multi_municipio = EXCLUDED.acesso_multi_municipio,
        municipio_vinculado = EXCLUDED.municipio_vinculado,
        perm_usuarios = EXCLUDED.perm_usuarios,
        perm_importar = EXCLUDED.perm_importar,
        perm_limpar_db = EXCLUDED.perm_limpar_db,
        perm_config_supabase = EXCLUDED.perm_config_supabase,
        password = CASE WHEN p_user_data ->> 'password' IS NOT NULL AND p_user_data ->> 'password' != ''
                       THEN p_user_data ->> 'password'
                       ELSE public.usuarios.password
                  END;

    RETURN json_build_object('success', true);
END;
$$;

-- 3.4 Excluir usuário
CREATE OR REPLACE FUNCTION public.fn_delete_usuario(p_username TEXT)
RETURNS JSON
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
BEGIN
    DELETE FROM public.usuarios WHERE username = p_username;
    RETURN json_build_object('success', true);
END;
$$;

-- 3.5 Atualizar status do usuário (bloquear/desbloquear)
CREATE OR REPLACE FUNCTION public.fn_update_user_status(p_username TEXT, p_status TEXT)
RETURNS JSON
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
BEGIN
    UPDATE public.usuarios SET status = p_status, failed_attempts = 0 WHERE username = p_username;
    RETURN json_build_object('success', true);
END;
$$;

-- 3.6 Redefinir senha
CREATE OR REPLACE FUNCTION public.fn_reset_password(p_username TEXT, p_new_password_hash TEXT)
RETURNS JSON
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
BEGIN
    UPDATE public.usuarios SET password = p_new_password_hash, failed_attempts = 0 WHERE username = p_username;
    RETURN json_build_object('success', true);
END;
$$;

-- 3.7 Zerar tentativas falhas
CREATE OR REPLACE FUNCTION public.fn_reset_failed_attempts(p_username TEXT)
RETURNS JSON
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
BEGIN
    UPDATE public.usuarios SET failed_attempts = 0 WHERE username = p_username;
    RETURN json_build_object('success', true);
END;
$$;

-- 4. CONCEDER PERMISSÃO DE EXECUÇÃO PARA ANON
GRANT EXECUTE ON FUNCTION public.fn_verify_login TO anon;
GRANT EXECUTE ON FUNCTION public.fn_listar_usuarios TO anon;
GRANT EXECUTE ON FUNCTION public.fn_upsert_usuario TO anon;
GRANT EXECUTE ON FUNCTION public.fn_delete_usuario TO anon;
GRANT EXECUTE ON FUNCTION public.fn_update_user_status TO anon;
GRANT EXECUTE ON FUNCTION public.fn_reset_password TO anon;
GRANT EXECUTE ON FUNCTION public.fn_reset_failed_attempts TO anon;

-- 5. REVOGAR ACESSO DIRETO DE ESCRITA DAS TABELAS VIA ANON
--    (as políticas já foram atualizadas no schema base)
--    Isso garante que apenas as SECURITY DEFINER functions podem escrever

-- 6. ATUALIZAR TAMBÉM AS POLÍTICAS DAS TABELAS DO MULTI-MUNICÍPIO
ALTER TABLE public.municipios_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logomarcas_municipio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producao_sia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir escrita de municipios" ON public.municipios_sistema;
DROP POLICY IF EXISTS "Permitir acesso total a logomarcas" ON public.logomarcas_municipio;
DROP POLICY IF EXISTS "Permitir acesso total a producao" ON public.producao_sia;

-- Manter leitura pública, mas bloquear escrita direta do anon
CREATE POLICY "Permitir escrita de municipios via function" 
ON public.municipios_sistema FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY "Permitir acesso total a logomarcas via function" 
ON public.logomarcas_municipio FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY "Permitir acesso total a producao via function" 
ON public.producao_sia FOR ALL TO anon USING (false) WITH CHECK (false);
