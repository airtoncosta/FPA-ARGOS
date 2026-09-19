-- =========================================================
-- ARGOS — MIGRATION: DT. ATRIBUIÇÃO (DATASUS CNESNet)
-- Adiciona coluna dt_atribuicao na tabela public.cnes_profissionais
-- =========================================================

ALTER TABLE public.cnes_profissionais ADD COLUMN IF NOT EXISTS dt_atribuicao VARCHAR(50);

COMMENT ON COLUMN public.cnes_profissionais.dt_atribuicao IS 'Data e hora oficial de atribuição do profissional segundo o DATASUS CNESNet (cnes2.datasus.gov.br)';

-- Índice de apoio para consultas rápidas por data de atribuição
CREATE INDEX IF NOT EXISTS idx_cnes_profissionais_dt_atribuicao 
ON public.cnes_profissionais (dt_atribuicao);
