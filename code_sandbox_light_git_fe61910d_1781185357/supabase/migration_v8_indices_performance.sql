-- =========================================================
-- ARGOS v8.0 — OTIMIZAÇÃO DE PERFORMANCE & ÍNDICES ESTRATÉGICOS
-- Execute este script no SQL Editor do Supabase
-- =========================================================

-- 1. TABELA: producoes_bpa
-- Chave estrangeira (FK) sem índice causava scans sequenciais em joins e deletes
CREATE INDEX IF NOT EXISTS idx_producoes_bpa_municipio_id 
ON public.producoes_bpa(municipio_id);

-- Índice composto para consultas por município, competência e ordenação cronológica
CREATE INDEX IF NOT EXISTS idx_producoes_bpa_mun_comp_criado 
ON public.producoes_bpa(municipio_id, competencia, criado_em DESC);

-- Índice parcial para filtrar produções com transmissão de e-mail pendente ou com erro
CREATE INDEX IF NOT EXISTS idx_producoes_bpa_email_pendente 
ON public.producoes_bpa(email_status, criado_em DESC) 
WHERE email_status IN ('NAO_ENVIADO', 'ERRO');


-- 2. TABELA: producao_sia
-- Índice B-Tree para ordenação e relatórios por competência
CREATE INDEX IF NOT EXISTS idx_producao_sia_comp_importado 
ON public.producao_sia(competencia, importado_em DESC);

-- Índice GIN com operador especializado jsonb_path_ops para consultas ultra-rápidas dentro do JSON
CREATE INDEX IF NOT EXISTS idx_producao_sia_dados_json_gin 
ON public.producao_sia USING gin (dados_json jsonb_path_ops);


-- 3. TABELA: cnes_movimentacoes
-- Filtro principal do painel de movimentações mensais
CREATE INDEX IF NOT EXISTS idx_cnes_mov_ibge_comp 
ON public.cnes_movimentacoes(municipio_ibge, competencia_atual, criado_em DESC);

-- Rastreamento de histórico de movimentação por profissional (CNS)
CREATE INDEX IF NOT EXISTS idx_cnes_mov_cns 
ON public.cnes_movimentacoes(cns);

-- Índice GIN para busca de inconsistências e detalhes no JSONB
CREATE INDEX IF NOT EXISTS idx_cnes_mov_detalhes_gin 
ON public.cnes_movimentacoes USING gin (detalhes jsonb_path_ops);


-- 4. TABELA: cnes_profissionais
-- Detecção rápida de sobreposição de jornada e acúmulo de vínculos SUS (>60h)
CREATE INDEX IF NOT EXISTS idx_cnes_prof_cns_comp_ch 
ON public.cnes_profissionais(cns, competencia, ch_total);

-- Índice parcial para filtragem imediata de inconformidades da Portaria 134
CREATE INDEX IF NOT EXISTS idx_cnes_prof_portaria134 
ON public.cnes_profissionais(cnes, competencia) 
WHERE portaria134 IS NOT NULL AND portaria134 != '';

-- Busca de profissionais por nome (autocomplete e consultas rápidas)
CREATE INDEX IF NOT EXISTS idx_cnes_prof_nome 
ON public.cnes_profissionais(nome);


-- 5. TABELA: cnes_estabelecimentos
-- Busca rápida de estabelecimentos por município e nome fantasia
CREATE INDEX IF NOT EXISTS idx_cnes_estab_ibge_nome 
ON public.cnes_estabelecimentos(codigo_ibge, nome_fantasia);

-- Índice GIN para busca estruturada em serviços e classificações do estabelecimento
CREATE INDEX IF NOT EXISTS idx_cnes_estab_dados_gin 
ON public.cnes_estabelecimentos USING gin (dados jsonb_path_ops);


-- 6. TABELA: historico_acoes (Auditoria)
-- Atende com custo O(log N) a consulta de histórico de ações do usuário logado
CREATE INDEX IF NOT EXISTS idx_hist_user_criado 
ON public.historico_acoes(usuario_login, created_at DESC);

-- Filtro e auditoria por módulo do sistema
CREATE INDEX IF NOT EXISTS idx_hist_modulo_criado 
ON public.historico_acoes(modulo, created_at DESC);


-- 7. TABELA: usuarios
-- Filtragem de usuários ativos/bloqueados no painel de administração
CREATE INDEX IF NOT EXISTS idx_usuarios_status 
ON public.usuarios(status);

-- Filtragem por município de vínculo do operador
CREATE INDEX IF NOT EXISTS idx_usuarios_municipio 
ON public.usuarios(municipio_vinculado);


-- 8. TABELA: logomarcas_municipio
-- Índice parcial para resolução instantânea da logomarca ativa do município
CREATE INDEX IF NOT EXISTS idx_logo_municipio_ativa 
ON public.logomarcas_municipio(municipio_id) 
WHERE ativa = TRUE;


-- 9. TABELA: procedimentos (SIGTAP)
-- Busca de procedimentos por descrição textual
CREATE INDEX IF NOT EXISTS idx_procedimentos_descricao 
ON public.procedimentos(descricao);


-- 10. TABELA: municipios_sistema
-- Busca de municípios por nome
CREATE INDEX IF NOT EXISTS idx_municipios_nome 
ON public.municipios_sistema(nome);
