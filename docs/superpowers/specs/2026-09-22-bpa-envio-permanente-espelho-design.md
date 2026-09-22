# Envio Permanente BPA + Espelho de Produção na Nuvem — Design

Data: 2026-09-22 · Abordagem aprovada: **A. Direta ampliada** (browser → Supabase, sem backend novo)

## 1. Problema

Auditoria do fluxo (2026-09-22) encontrou:

- Envio BPA: erro na nuvem faz `saveProducao` lançar exceção sem retry/fila — o envio se perde (só `alert`). `bpa-module.js:2048-2050,4345-4347`.
- Auditoria descartada: `handleFormSubmit` monta `status_auditoria/total_apontamentos/auditado_em/fingerprint`, mas `saveProducao` reconstrói o `newRecord` sem esses campos — nada sobrevive ao reload (nem ao próprio save). `bpa-module.js:2018-2033,4319-4332`.
- Delete inconsistente: registro da nuvem apagado só do cache quando em modo local/offline ressuscita no próximo `load`. `bpa-module.js:2114-2119`.
- Espelho (`producao-profissional-module.js`): persiste **só** em `localStorage` (`argos_producoes_profissionais_cns`), sem namespace por usuário (vazamento cross-login), expurgo de órfãos pulado quando a lista BPA está vazia (corrida de init mostra dados obsoletos), filtros com competências fixas `06/07/08/2026`, agregação sem dedup cross-remessa.

## 2. Escopo

- [x] Envio permanente no Supabase com retry (outbox local)
- [x] Auditoria persistida junto à produção (sobrevive ao reload)
- [x] Espelho persistido na nuvem + exibição correta
- [ ] Backend próprio de persistência (fora de escopo — abordagem B rejeitada)

## 3. Banco — `migration_v9_bpa_envio_permanente_espelho.sql`

Aplicada pelo usuário no SQL Editor (idempotente, só `IF NOT EXISTS`):

```sql
ALTER TABLE public.producoes_bpa ADD COLUMN IF NOT EXISTS status_auditoria VARCHAR(50);
ALTER TABLE public.producoes_bpa ADD COLUMN IF NOT EXISTS total_apontamentos INTEGER DEFAULT 0;
ALTER TABLE public.producoes_bpa ADD COLUMN IF NOT EXISTS auditado_em TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.producoes_bpa ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_producoes_bpa_fingerprint ON public.producoes_bpa(fingerprint);

CREATE TABLE IF NOT EXISTS public.espelho_producao_profissional (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    producao_id UUID REFERENCES public.producoes_bpa(id) ON DELETE CASCADE,
    cnes VARCHAR(20),
    competencia VARCHAR(20) NOT NULL,
    cns_profissional VARCHAR(20),
    nome_profissional VARCHAR(255),
    cbo VARCHAR(10),
    procedimento VARCHAR(20),
    quantidade INTEGER DEFAULT 0,
    valor_sa NUMERIC(12,2),
    digitador_username VARCHAR(255),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_espelho_comp ON public.espelho_producao_profissional(competencia);
CREATE INDEX IF NOT EXISTS idx_espelho_cns ON public.espelho_producao_profissional(cns_profissional);
CREATE INDEX IF NOT EXISTS idx_espelho_prod ON public.espelho_producao_profissional(producao_id);
```

RLS: mesmo padrão aberto do projeto (`migration_producoes_bpa.sql`): `ENABLE ROW LEVEL SECURITY` + políticas `TO anon` de SELECT/INSERT/UPDATE/DELETE com `USING (true)`.

## 4. Envio permanente — `js/bpa-module.js`

- `saveProducao`: incluir `status_auditoria, total_apontamentos, auditado_em, fingerprint` no `newRecord` (vindos do `finalData`).
- Outbox: em falha de nuvem, gravar o registro em `argos_bpa_outbox` (localStorage) com `_localOnly` e **não** lançar; `loadProducoes` tenta reenviar a outbox automaticamente antes de listar.
- Cache local passa a espelhar confirmações da nuvem (leitura imediata após envio).
- `deleteProducao`: nunca remover do cache local um registro que existe na nuvem sem confirmar o delete remoto; erro remoto = `return false` sem tocar em nada local (estender ao caso modo-local o comportamento já correto do caso de erro).

## 5. Auditoria persistida — `js/bpa-module.js`

- `loadProducoes`: ao hidratar produções com `fingerprint`, restaurar `auditApproval` correspondente (fingerprint igual ao do arquivo pendente → gate `canSubmitPendingUpload` continua valendo sem re-auditar).
- Regra: produção sem campos de auditoria = "não auditada" (exige pente-fino antes do envio oficial, comportamento atual preservado).

## 6. Espelho — `js/producao-profissional-module.js`

- Escrita: após `recordProducaoProfissionais`, upsert na tabela do espelho (apagar linhas da `producao_id` e reinserir — reenvio não duplica); manter escrita local como fallback imediato.
- Leitura: nuvem-primeiro (`producoes_bpa` + `espelho_producao_profissional` filtrando por acesso/unidade, mesmo padrão de `loadProducoes`), fallback local.
- Chave local com namespace por usuário (`argos_producoes_profissionais_cns:<username>`).
- Expurgo de órfãos **somente** após a lista BPA estar carregada e não-vazia por motivo válido (flag `bpaListaPronta`); nunca expurgar durante init.
- Exibição: opções de competência derivadas dos dados reais (fim das fixas `06/07/08/2026`); dedup de atendimentos por paciente+data+competência cross-remessa; agregação sem fundir unidades diferentes.

## 7. Testes

- Novo `scripts/tests/bpa-envio-permanente.test.cjs`: outbox/retry, auditoria presente no `newRecord`, delete sem ressurreição.
- Estender `scripts/tests/producao-profissional.test.cjs`: expurgo condicionado, namespace por usuário, dedup cross-remessa.
- Migration: sem teste automático (idempotente por construção; usuário confirma execução no dashboard).

## 8. Riscos e limites

- Mantém o padrão RLS aberto do projeto (decisão existente, não reavaliada aqui).
- Sem backend: regras críticas continuam no browser; outbox não sincroniza entre máquinas (só a nuvem é fonte compartilhada).
- Tabela do espelho cresce por linha profissional — índices previstos; sem particionamento nesta versão.
