-- =========================================================
-- ARGOS — ATUALIZAÇÃO SIGTAP VALORES REAIS E RPCs
-- Executar no SQL Editor do Supabase
-- =========================================================

-- 1. Garantir que a tabela procedimentos possui valor_unitario numérico
ALTER TABLE IF EXISTS public.procedimentos 
    ADD COLUMN IF NOT EXISTS valor_unitario NUMERIC(12, 2) DEFAULT 0.00;

-- 2. Atualizar a função RPC fn_carregar_procedimentos para incluir valor_unitario
CREATE OR REPLACE FUNCTION public.fn_carregar_procedimentos()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(json_build_object(
        'codigo', p.codigo,
        'descricao', p.descricao,
        'valor_unitario', COALESCE(p.valor_unitario, 0.00)
    ) ORDER BY p.codigo) INTO v_result
    FROM public.procedimentos p;
    
    RETURN COALESCE(v_result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_carregar_procedimentos() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_carregar_procedimentos() TO authenticated;
