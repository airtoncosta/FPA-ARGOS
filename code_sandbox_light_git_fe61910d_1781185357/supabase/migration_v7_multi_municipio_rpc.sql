-- =========================================================
-- ARGOS v7.0 — RPC FUNCTIONS PARA MULTI-MUNICÍPIO
-- Execute APÓS as migrations v5 e v6
-- =========================================================

-- 1. FUNÇÕES PARA municipios_sistema

CREATE OR REPLACE FUNCTION public.fn_listar_municipios()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(json_build_object(
        'id', m.id,
        'nome', m.nome,
        'uf', m.uf,
        'criado_em', m.criado_em
    ) ORDER BY m.nome) INTO v_result
    FROM public.municipios_sistema m;
    RETURN COALESCE(v_result, '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_registrar_municipio(p_nome TEXT, p_uf TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_normalized_nome TEXT;
    v_normalized_uf TEXT;
BEGIN
    v_normalized_nome := upper(trim(p_nome));
    v_normalized_uf := upper(trim(p_uf));

    SELECT m.id INTO v_id FROM public.municipios_sistema m
    WHERE m.uf = v_normalized_uf AND upper(trim(m.nome)) = v_normalized_nome;

    IF v_id IS NULL THEN
        INSERT INTO public.municipios_sistema (nome, uf)
        VALUES (v_normalized_nome, v_normalized_uf)
        RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
END;
$$;

-- 2. FUNÇÕES PARA producao_sia

CREATE OR REPLACE FUNCTION public.fn_listar_resumo_bases()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(sub) INTO v_result FROM (
        SELECT m.id, m.nome, m.uf, json_agg(DISTINCT p.competencia ORDER BY p.competencia) AS competencias
        FROM public.producao_sia p
        JOIN public.municipios_sistema m ON m.id = p.municipio_id
        GROUP BY m.id, m.nome, m.uf
        ORDER BY m.nome
    ) sub;
    RETURN COALESCE(v_result, '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_salvar_producao_sia(
    p_municipio_id UUID,
    p_competencia TEXT,
    p_nome_arquivo TEXT,
    p_dados_json JSONB,
    p_importado_por TEXT
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.producao_sia (municipio_id, competencia, nome_arquivo, dados_json, importado_por, importado_em)
    VALUES (p_municipio_id, p_competencia, p_nome_arquivo, p_dados_json, p_importado_por, now())
    ON CONFLICT (municipio_id, competencia) DO UPDATE SET
        nome_arquivo = EXCLUDED.nome_arquivo,
        dados_json = EXCLUDED.dados_json,
        importado_por = EXCLUDED.importado_por,
        importado_em = EXCLUDED.importado_em;
    RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_carregar_producao_sia(p_municipio_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(row_to_json(p.*) ORDER BY p.competencia) INTO v_result
    FROM public.producao_sia p
    WHERE p.municipio_id = p_municipio_id;
    RETURN COALESCE(v_result, '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_excluir_producao_sia(p_municipio_id UUID, p_competencia TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    DELETE FROM public.producao_sia
    WHERE municipio_id = p_municipio_id AND competencia = p_competencia;
    RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_excluir_todas_producao_sia(p_municipio_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    DELETE FROM public.producao_sia WHERE municipio_id = p_municipio_id;
    RETURN json_build_object('success', true);
END;
$$;

-- 3. FUNÇÕES PARA logomarcas_municipio

CREATE OR REPLACE FUNCTION public.fn_salvar_logo_municipio(p_municipio_id UUID, p_base64 TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_data JSON;
BEGIN
    UPDATE public.logomarcas_municipio SET ativa = false WHERE municipio_id = p_municipio_id;
    INSERT INTO public.logomarcas_municipio (municipio_id, logo_base64, ativa)
    VALUES (p_municipio_id, p_base64, true)
    RETURNING row_to_json(logomarcas_municipio.*) INTO v_data;
    RETURN json_build_object('success', true, 'data', v_data);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_carregar_logo_municipio(p_municipio_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_data JSON;
BEGIN
    SELECT row_to_json(l.*) INTO v_data FROM public.logomarcas_municipio l
    WHERE l.municipio_id = p_municipio_id AND l.ativa = true
    LIMIT 1;
    RETURN v_data;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_carregar_historico_logos(p_municipio_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(row_to_json(l.*) ORDER BY l.criado_em DESC) INTO v_result
    FROM public.logomarcas_municipio l
    WHERE l.municipio_id = p_municipio_id
    LIMIT 10;
    RETURN COALESCE(v_result, '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_excluir_logo_municipio(p_logo_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    DELETE FROM public.logomarcas_municipio WHERE id = p_logo_id;
    RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_limpar_logo_municipio(p_municipio_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    UPDATE public.logomarcas_municipio SET ativa = false WHERE municipio_id = p_municipio_id;
    RETURN json_build_object('success', true);
END;
$$;

-- 4. FUNÇÕES PARA configuracoes (logo global, portaria, etc.)

CREATE OR REPLACE FUNCTION public.fn_salvar_config(p_chave TEXT, p_valor TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.configuracoes (chave, valor, updated_at)
    VALUES (p_chave, p_valor, now())
    ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = EXCLUDED.updated_at;
    RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_carregar_config(p_chave TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_valor TEXT;
BEGIN
    SELECT c.valor INTO v_valor FROM public.configuracoes c WHERE c.chave = p_chave LIMIT 1;
    RETURN v_valor;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_excluir_config(p_chave TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    DELETE FROM public.configuracoes WHERE chave = p_chave;
    RETURN json_build_object('success', true);
END;
$$;

-- 5. FUNÇÕES PARA procedimentos (SIGTAP)

CREATE OR REPLACE FUNCTION public.fn_upload_sigtap(p_dados JSONB)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_item JSON;
    v_total INT;
    v_processados INT := 0;
BEGIN
    DELETE FROM public.procedimentos;
    v_total := jsonb_array_length(p_dados);
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_dados)
    LOOP
        INSERT INTO public.procedimentos (codigo, descricao, valor_unitario)
        VALUES (
            v_item ->> 'codigo',
            v_item ->> 'descricao',
            COALESCE((v_item ->> 'valor_unitario')::numeric, 0.00)
        )
        ON CONFLICT (codigo) DO UPDATE SET
            descricao = EXCLUDED.descricao,
            valor_unitario = EXCLUDED.valor_unitario;
        v_processados := v_processados + 1;
    END LOOP;
    RETURN json_build_object('success', true, 'total', v_total, 'processados', v_processados);
END;
$$;

-- 6. FUNÇÃO PARA TESTAR CONEXÃO

CREATE OR REPLACE FUNCTION public.fn_testar_conexao()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN json_build_object('success', true, 'message', 'Conectado com sucesso ao Supabase!');
END;
$$;

-- 7. FUNÇÃO GENÉRICA PARA SELECT COM FILTRO (usada para carregar procedimentos)

CREATE OR REPLACE FUNCTION public.fn_carregar_procedimentos()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(json_build_object('codigo', p.codigo, 'descricao', p.descricao) ORDER BY p.codigo) INTO v_result
    FROM public.procedimentos p;
    RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- 8. CONCEDER EXECUÇÃO PARA anon

GRANT EXECUTE ON FUNCTION public.fn_listar_municipios TO anon;
GRANT EXECUTE ON FUNCTION public.fn_registrar_municipio TO anon;
GRANT EXECUTE ON FUNCTION public.fn_listar_resumo_bases TO anon;
GRANT EXECUTE ON FUNCTION public.fn_salvar_producao_sia TO anon;
GRANT EXECUTE ON FUNCTION public.fn_carregar_producao_sia TO anon;
GRANT EXECUTE ON FUNCTION public.fn_excluir_producao_sia TO anon;
GRANT EXECUTE ON FUNCTION public.fn_excluir_todas_producao_sia TO anon;
GRANT EXECUTE ON FUNCTION public.fn_salvar_logo_municipio TO anon;
GRANT EXECUTE ON FUNCTION public.fn_carregar_logo_municipio TO anon;
GRANT EXECUTE ON FUNCTION public.fn_carregar_historico_logos TO anon;
GRANT EXECUTE ON FUNCTION public.fn_excluir_logo_municipio TO anon;
GRANT EXECUTE ON FUNCTION public.fn_limpar_logo_municipio TO anon;
GRANT EXECUTE ON FUNCTION public.fn_salvar_config TO anon;
GRANT EXECUTE ON FUNCTION public.fn_carregar_config TO anon;
GRANT EXECUTE ON FUNCTION public.fn_excluir_config TO anon;
GRANT EXECUTE ON FUNCTION public.fn_upload_sigtap TO anon;
GRANT EXECUTE ON FUNCTION public.fn_carregar_procedimentos TO anon;
GRANT EXECUTE ON FUNCTION public.fn_testar_conexao TO anon;

-- 9. ATUALIZAR POLÍTICAS RLS — anon só pode ler, escreve só via RPC
DROP POLICY IF EXISTS "Permitir leitura de municipios" ON public.municipios_sistema;
DROP POLICY IF EXISTS "Permitir escrita de municipios via function" ON public.municipios_sistema;
DROP POLICY IF EXISTS "Permitir leitura de logomarcas" ON public.logomarcas_municipio;
DROP POLICY IF EXISTS "Permitir acesso total a logomarcas via function" ON public.logomarcas_municipio;
DROP POLICY IF EXISTS "Permitir leitura de producao" ON public.producao_sia;
DROP POLICY IF EXISTS "Permitir acesso total a producao via function" ON public.producao_sia;
DROP POLICY IF EXISTS "Permitir leitura de configuracoes" ON public.configuracoes;
DROP POLICY IF EXISTS "Permitir escrita de configuracoes via function" ON public.configuracoes;
DROP POLICY IF EXISTS "Permitir leitura de procedimentos" ON public.procedimentos;
DROP POLICY IF EXISTS "Permitir escrita de procedimentos via function" ON public.procedimentos;
DROP POLICY IF EXISTS "Permitir leitura de historico" ON public.historico_acoes;
DROP POLICY IF EXISTS "Permitir insercao de historico" ON public.historico_acoes;
DROP POLICY IF EXISTS "Permitir leitura de usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Permitir escrita de usuarios via function" ON public.usuarios;

-- Municipios: SELECT livre (anon), INSERT/UPDATE/DELETE só via RPC
CREATE POLICY "Municipios SELECT anon" ON public.municipios_sistema FOR SELECT TO anon USING (true);
CREATE POLICY "Municipios RESTRITO anon" ON public.municipios_sistema FOR ALL TO anon USING (false) WITH CHECK (false);

-- Logomarcas: SELECT livre, escrita só via RPC
CREATE POLICY "Logomarcas SELECT anon" ON public.logomarcas_municipio FOR SELECT TO anon USING (true);
CREATE POLICY "Logomarcas RESTRITO anon" ON public.logomarcas_municipio FOR ALL TO anon USING (false) WITH CHECK (false);

-- Producao SIA: SELECT livre, escrita só via RPC
CREATE POLICY "Producao SIA SELECT anon" ON public.producao_sia FOR SELECT TO anon USING (true);
CREATE POLICY "Producao SIA RESTRITO anon" ON public.producao_sia FOR ALL TO anon USING (false) WITH CHECK (false);

-- Configuracoes: SELECT livre, escrita só via RPC
CREATE POLICY "Configuracoes SELECT anon" ON public.configuracoes FOR SELECT TO anon USING (true);
CREATE POLICY "Configuracoes RESTRITO anon" ON public.configuracoes FOR ALL TO anon USING (false) WITH CHECK (false);

-- Procedimentos: SELECT livre, escrita só via RPC
CREATE POLICY "Procedimentos SELECT anon" ON public.procedimentos FOR SELECT TO anon USING (true);
CREATE POLICY "Procedimentos RESTRITO anon" ON public.procedimentos FOR ALL TO anon USING (false) WITH CHECK (false);

-- Historico: INSERT livre (para logging), SELECT livre
CREATE POLICY "Historico SELECT anon" ON public.historico_acoes FOR SELECT TO anon USING (true);
CREATE POLICY "Historico INSERT anon" ON public.historico_acoes FOR INSERT TO anon WITH CHECK (true);

-- Usuarios: SELECT via RPC, escrita via RPC
CREATE POLICY "Usuarios SELECT anon" ON public.usuarios FOR SELECT TO anon USING (true);
CREATE POLICY "Usuarios RESTRITO anon" ON public.usuarios FOR ALL TO anon USING (false) WITH CHECK (false);
