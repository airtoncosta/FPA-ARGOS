# Envio Permanente BPA + Espelho na Nuvem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Envio BPA salvo permanente no Supabase (com retry e auditoria junto), espelho de produção persistido na nuvem e exibido corretamente.

**Architecture:** Abordagem A aprovada — browser fala direto com Supabase (padrão atual do projeto, RLS aberto), sem backend novo. Outbox local para retry, upsert do espelho por produção, leitura nuvem-primeiro com fallback local.

**Tech Stack:** Vanilla JS (browser + node:test), Supabase (tabela `producoes_bpa`, nova `espelho_producao_profissional`), localStorage como cache/outbox.

**Spec:** `docs/superpowers/specs/2026-09-22-bpa-envio-permanente-espelho-design.md`

## Global Constraints

- Shell do ambiente é Windows PowerShell: separar comandos com `;` (nunca `&&`).
- Testes: `node --test scripts/tests/<arquivo>.test.cjs` a partir da raiz do repo.
- Arquivos JS usam CRLF: edições devem preservar quebras de linha (preferir script `.cjs` em `scratch/` para trocas longas, apagar depois).
- TDD estrito: teste vermelho → implementação mínima → verde → commit por task.
- Passo 0 (humano, antes de publicar): rodar a migration da Task 1 no SQL Editor do Supabase — inserts com as colunas novas falham sem ela.

---

## File Structure

- Create: `code_sandbox_light_git_fe61910d_1781185357/supabase/migration_v9_bpa_envio_permanente_espelho.sql` — colunas de auditoria + tabela do espelho + RLS (Task 1).
- Create: `scripts/tests/bpa-envio-permanente.test.cjs` — outbox/retry, auditoria no insert, delete sem ressurreição, restore de aprovação (Tasks 2–4).
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js` — `saveProducao` (~2015), `loadProducoes` (~1804), `deleteProducao` (~2076), `setAuditResult` (~120), `buscarAprovacaoSalva` (nova), `handleFileSelect` onload (~4213) (Tasks 2–4).
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/producao-profissional-module.js` — `recordProducaoProfissionais` (~271), `removeProducao` (~515), `loadData` (~558), `getExistingBpaProductions` (~658), `populateFilterOptions` (~682), `aggregateProfissionais` (~482), `getFilteredAndAggregatedProfissionais` (~751) (Tasks 5–6).
- Modify: `scripts/tests/bpa-access.test.cjs:44` — atualizar expectativa do teste de falha de gravação (Task 3).
- Modify: `scripts/tests/producao-profissional.test.cjs` — estender com namespace/expurgo/dedup (Task 6).
- Modify (delta de spec): `docs/superpowers/specs/2026-09-22-bpa-envio-permanente-espelho-design.md` seções 3 e 6 — grão da tabela do espelho passa a ser 1 linha por profissional com `procedimentos JSONB` (Task 1).

---

### Task 1: Migration v9 (auditoria + tabela do espelho)

**Files:**
- Create: `code_sandbox_light_git_fe61910d_1781185357/supabase/migration_v9_bpa_envio_permanente_espelho.sql`
- Modify: `docs/superpowers/specs/2026-09-22-bpa-envio-permanente-espelho-design.md` (seções 3 e 6: trocar `procedimento/quantidade/valor_sa` por `procedimentos JSONB + totais`)

**Interfaces:**
- Consumes: padrão RLS de `supabase/migration_producoes_bpa.sql:41-55`, função `fn_listar_producoes_bpa` (`:58-85`).
- Produces: colunas `status_auditoria, total_apontamentos, auditado_em, fingerprint` em `producoes_bpa`; tabela `espelho_producao_profissional`; políticas RLS `TO anon`.

- [ ] **Step 1: Criar o arquivo SQL com o conteúdo exato abaixo**

```sql
-- =========================================================
-- ARGOS v9 — ENVIO PERMANENTE BPA + ESPELHO NA NUVEM
-- Idempotente: só IF NOT EXISTS / OR REPLACE. Rodar no SQL Editor.
-- =========================================================

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
    cns_profissional VARCHAR(255),
    nome_profissional VARCHAR(255),
    cbo VARCHAR(10),
    procedimentos JSONB DEFAULT '[]',
    total_quantidade INTEGER DEFAULT 0,
    total_atendimentos INTEGER DEFAULT 0,
    total_valor NUMERIC(12,2),
    digitador_username VARCHAR(255),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_espelho_comp ON public.espelho_producao_profissional(competencia);
CREATE INDEX IF NOT EXISTS idx_espelho_cns ON public.espelho_producao_profissional(cns_profissional);
CREATE INDEX IF NOT EXISTS idx_espelho_prod ON public.espelho_producao_profissional(producao_id);

ALTER TABLE public.espelho_producao_profissional ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura de espelho" ON public.espelho_producao_profissional;
CREATE POLICY "Permitir leitura de espelho" ON public.espelho_producao_profissional FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Permitir insercao de espelho" ON public.espelho_producao_profissional;
CREATE POLICY "Permitir insercao de espelho" ON public.espelho_producao_profissional FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Permitir update de espelho" ON public.espelho_producao_profissional;
CREATE POLICY "Permitir update de espelho" ON public.espelho_producao_profissional FOR UPDATE TO anon USING (true);
DROP POLICY IF EXISTS "Permitir exclusao de espelho" ON public.espelho_producao_profissional;
CREATE POLICY "Permitir exclusao de espelho" ON public.espelho_producao_profissional FOR DELETE TO anon USING (true);

CREATE OR REPLACE FUNCTION public.fn_listar_producoes_bpa(p_competencia TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(json_build_object(
        'id', p.id,
        'nome_arquivo', p.nome_arquivo,
        'estabelecimento_nome', p.estabelecimento_nome,
        'cnes', p.cnes,
        'competencia', p.competencia,
        'tipo_bpa', p.tipo_bpa,
        'tamanho_bytes', p.tamanho_bytes,
        'tamanho_formatado', p.tamanho_formatado,
        'digitador_username', p.digitador_username,
        'digitador_nome', p.digitador_nome,
        'observacoes', p.observacoes,
        'status', p.status,
        'status_auditoria', p.status_auditoria,
        'total_apontamentos', p.total_apontamentos,
        'auditado_em', p.auditado_em,
        'fingerprint', p.fingerprint,
        'criado_em', p.criado_em
    ) ORDER BY p.criado_em DESC) INTO v_result
    FROM public.producoes_bpa p
    WHERE (p_competencia IS NULL OR p.competencia = p_competencia);

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
```

- [ ] **Step 2: Verificar que todo statement é idempotente**

Run: `node -e "const s=require('fs').readFileSync('code_sandbox_light_git_fe61910d_1781185357/supabase/migration_v9_bpa_envio_permanente_espelho.sql','utf8');const stmts=s.split(';').map(x=>x.trim()).filter(x=>x&&!x.startsWith('--'));const bad=stmts.filter(x=>!/IF NOT EXISTS|OR REPLACE|DROP POLICY IF EXISTS/.test(x));console.log('statements:',stmts.length,' nao-idempotentes:',bad.length);if(bad.length){console.log(bad);process.exit(1)}"`
Expected: `statements: 19 nao-idempotentes: 0`

- [ ] **Step 3: Atualizar a spec (delta de grão da tabela do espelho)**

Em `docs/superpowers/specs/2026-09-22-bpa-envio-permanente-espelho-design.md`, seção 3: substituir o bloco `CREATE TABLE espelho_producao_profissional` pelo statement do Step 1 e acrescentar nota: "Delta vs rascunho inicial: grão 1 linha por profissional com `procedimentos JSONB` (1:1 com o record do espelho), em vez de 1 linha por procedimento." Seção 6: trocar "grava linhas na tabela do espelho" por "grava 1 linha por profissional (upsert por produção)".

- [ ] **Step 4: Commit**

```bash
git add code_sandbox_light_git_fe61910d_1781185357/supabase/migration_v9_bpa_envio_permanente_espelho.sql docs/superpowers/specs/2026-09-22-bpa-envio-permanente-espelho-design.md
git commit -m "feat(bpa): migration v9 auditoria + tabela espelho"
```

---

### Task 2: Auditoria persistida no `saveProducao`

**Files:**
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js:2018-2033` (literal `newRecord`)
- Test: `scripts/tests/bpa-envio-permanente.test.cjs` (novo; padrão vm de `scripts/tests/bpa-access.test.cjs:7-24`)

**Interfaces:**
- Consumes: `producaoData.status_auditoria/total_apontamentos/auditado_em/fingerprint` (montados em `handleFormSubmit`, `bpa-module.js:4329-4332`).
- Produces: `newRecord` com os 4 campos; payload do `insert` passa a incluí-los.

- [ ] **Step 1: Escrever o teste que falha**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js'), 'utf8');

function setup(supabaseImpl, user = { username: 'admin', role: 'ADM' }) {
    const store = new Map();
    const session = new Map([['argos_user', JSON.stringify(user)]]);
    const storage = m => ({ getItem: k => m.get(k) || null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) });
    let inserted = null;
    const client = supabaseImpl || { from: () => ({ insert: (rows) => { inserted = rows; return { select: async () => ({ data: [{ id: 'uuid-nuvem-1' }], error: null }) }; } }) };
    const ctx = {
        window: { SupabaseConfig: { isConnected: () => true, getClient: () => client } },
        document: { getElementById: () => null, querySelectorAll: () => [] },
        localStorage: storage(store), sessionStorage: storage(session),
        console: { error() {}, warn() {} }, alert() {}, confirm: () => true,
        crypto: require('node:crypto').webcrypto
    };
    ctx.window.BpaAuditCore = require('../../code_sandbox_light_git_fe61910d_1781185357/js/bpa-audit-core.js');
    vm.createContext(ctx); vm.runInContext(source, ctx);
    const b = ctx.window.BpaModule;
    b.renderAll = () => {};
    return { b, ctx, store, getInserted: () => inserted };
}

test('saveProducao persiste os campos de auditoria na nuvem', async () => {
    const { b, getInserted } = setup();
    const rec = await b.saveProducao({
        nomeArquivo: 'PAULTRAE.JUL', estabelecimentoNome: 'HOSPITAL MATERNO INFANTIL',
        cnes: '2387439', competencia: '07/2026', tipoBpa: 'BPA-I', conteudo: 'x',
        status_auditoria: 'COM_APONTAMENTOS', total_apontamentos: 4,
        auditado_em: '2026-09-22T10:00:00.000Z', fingerprint: 'fp-abc-123'
    });
    assert.equal(rec.status_auditoria, 'COM_APONTAMENTOS');
    assert.equal(rec.total_apontamentos, 4);
    assert.equal(rec.fingerprint, 'fp-abc-123');
    const payload = getInserted()[0];
    assert.equal(payload.status_auditoria, 'COM_APONTAMENTOS');
    assert.equal(payload.fingerprint, 'fp-abc-123');
    assert.equal(payload._localOnly, undefined);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/bpa-envio-permanente.test.cjs`
Expected: FAIL (`status_auditoria` undefined no record)

- [ ] **Step 3: Implementação mínima em `bpa-module.js:2018-2033`**

Acrescentar ao literal `newRecord`, após `status: 'ENVIADO',`:

```js
status_auditoria: producaoData.status_auditoria || 'NAO_AUDITADO',
total_apontamentos: producaoData.total_apontamentos || 0,
auditado_em: producaoData.auditado_em ? new Date(producaoData.auditado_em).toISOString() : null,
fingerprint: producaoData.fingerprint || '',
```

E antes do `insert`, remover a flag local do payload:

```js
const paraNuvem = { ...newRecord };
delete paraNuvem._localOnly;
const { data, error } = await client.from('producoes_bpa').insert([paraNuvem]).select();
```

(substituir a linha `const { data, error } = await client.from('producoes_bpa').insert([newRecord]).select();`)

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test scripts/tests/bpa-envio-permanente.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js scripts/tests/bpa-envio-permanente.test.cjs
git commit -m "feat(bpa): saveProducao persiste auditoria junto ao envio"
```

---

### Task 3: Outbox local com retry (nunca perder envio)

**Files:**
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js` — bloco try/catch do insert (`:2036-2055`), `loadProducoes` (`:1848-1870`)
- Test: `scripts/tests/bpa-envio-permanente.test.cjs` (acrescentar), `scripts/tests/bpa-access.test.cjs:44` (atualizar expectativa)

**Interfaces:**
- Consumes: `outboxKey: 'argos_bpa_outbox'` (nova prop ao lado de `localProducoesKey`, `:18`).
- Produces: `lerOutbox()`, `enfileirarOutbox(record)`, `removerDaOutbox(id)`, `reenviarOutbox()`; `saveProducao` não lança mais em falha de nuvem.

- [ ] **Step 1: Escrever os testes que falham (anexar ao arquivo da Task 2)**

```js
test('falha na nuvem guarda na outbox e resolve (sem perder o envio)', async () => {
    const failing = { from: () => ({ insert: () => ({ select: async () => ({ data: null, error: new Error('rede caiu') }) }) }) };
    const { b, store } = setup(failing);
    const rec = await b.saveProducao({
        nomeArquivo: 'PAULTRAE.JUL', estabelecimentoNome: 'HOSPITAL MATERNO INFANTIL',
        cnes: '2387439', competencia: '07/2026', tipoBpa: 'BPA-I', conteudo: 'x'
    });
    assert.equal(rec._localOnly, true);
    const outbox = JSON.parse(store.get(b.outboxKey) || '[]');
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].nome_arquivo, 'PAULTRAE.JUL');
});

test('reenviarOutbox drena a fila e limpa a cópia local', async () => {
    const { b, store } = setup();
    const rec = { id: 'pend-1', nome_arquivo: 'A.JUL', _localOnly: true };
    store.set(b.outboxKey, JSON.stringify([rec]));
    store.set(b.localProducoesKey, JSON.stringify([rec]));
    const r = await b.reenviarOutbox();
    assert.equal(r.enviados, 1);
    assert.equal(r.falhas, 0);
    assert.equal(JSON.parse(store.get(b.outboxKey) || '[]').length, 0);
    assert.equal(JSON.parse(store.get(b.localProducoesKey) || '[]').length, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/bpa-envio-permanente.test.cjs`
Expected: FAIL (`b.outboxKey` undefined; save rejeita em vez de resolver)

- [ ] **Step 3: Implementação mínima**

3a. Prop ao lado de `localProducoesKey` (`:18`): `outboxKey: 'argos_bpa_outbox',`

3b. Métodos novos (após `persistLocalProducao`, `:1796-1802`):

```js
lerOutbox() {
    try {
        const v = JSON.parse(localStorage.getItem(this.outboxKey) || '[]');
        return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
},
enfileirarOutbox(record) {
    try {
        const fila = this.lerOutbox().filter(r => r && r.id !== record.id);
        fila.unshift({ ...record });
        localStorage.setItem(this.outboxKey, JSON.stringify(fila));
    } catch (e) {}
},
removerDaOutbox(id) {
    try {
        localStorage.setItem(this.outboxKey, JSON.stringify(this.lerOutbox().filter(r => r && r.id !== id)));
    } catch (e) {}
},
async reenviarOutbox() {
    const resultado = { enviados: 0, falhas: 0 };
    if (this.persistenceMode === 'local' || !window.SupabaseConfig || !window.SupabaseConfig.isConnected()) return resultado;
    const client = window.SupabaseConfig.getClient();
    if (!client) return resultado;
    for (const rec of this.lerOutbox()) {
        try {
            const paraNuvem = { ...rec };
            delete paraNuvem._localOnly;
            const { data, error } = await client.from('producoes_bpa').insert([paraNuvem]).select();
            if (error) throw error;
            if (data && data[0] && data[0].id && data[0].id !== rec.id) {
                const idx = (this.producoes || []).findIndex(p => p.id === rec.id);
                if (idx > -1) this.producoes[idx].id = data[0].id;
            }
            this.persistLocalProducao(rec, true);
            this.removerDaOutbox(rec.id);
            resultado.enviados++;
        } catch (e) {
            resultado.falhas++;
            console.warn('Reenvio BPA adiado:', e.message);
        }
    }
    return resultado;
},
```

3c. `saveProducao`: trocar o `catch (e) { throw new Error('Não foi possível salvar a produção na nuvem: ' + e.message); }` (`:2048-2050`) por degradação com outbox. Reestruturar o bloco `:2035-2055` para:

```js
// Salvar no Supabase se disponível; em falha, guarda na outbox para reenvio (nunca perde o envio)
let salvoNaNuvem = false;
try {
    if (this.persistenceMode !== 'local' && window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
        const client = window.SupabaseConfig.getClient();
        if (!client) throw new Error('Conexão indisponível.');
        const paraNuvem = { ...newRecord };
        delete paraNuvem._localOnly;
        const { data, error } = await client.from('producoes_bpa').insert([paraNuvem]).select();
        if (error) throw error;
        if (data && data[0]) {
            newRecord.id = data[0].id;
        }
        salvoNaNuvem = true;
    }
} catch (e) {
    console.warn('Falha ao salvar na nuvem; envio guardado para reenvio:', e.message);
}

if (!salvoNaNuvem) {
    newRecord._localOnly = true;
    this.persistLocalProducao(newRecord);
    this.enfileirarOutbox(newRecord);
}
```

(substitui integralmente o `try/catch` das linhas 2036-2050 e o `if` das linhas 2052-2055.)

3d. `loadProducoes`: dentro do ramo `if (connected)`, após o bloco de sincronização de `configuracoes` (após a linha 1847, antes de `const unidades = ...` na 1848), inserir:

```js
try { await this.reenviarOutbox(); } catch (e) { console.warn('Outbox BPA adiada:', e.message); }
```

- [ ] **Step 4: Atualizar o teste antigo que esperava throw**

Em `scripts/tests/bpa-access.test.cjs:44`, substituir:

```js
test('falha ao gravar nuvem não anuncia produção como salva',async()=>{const {b,ctx}=setup();ctx.window.SupabaseConfig={isConnected:()=>true,getClient:()=>({from:()=>({insert:()=>({select:async()=>({error:new Error('negado')})})})})};await assert.rejects(b.saveProducao({cnes:own.cnes,estabelecimentoNome:own.estabelecimento_nome}),/Não foi possível salvar/);assert.equal(b.producoes.length,0);});
```

por:

```js
test('falha ao gravar nuvem guarda na outbox e marca local (sem perder)',async()=>{const {b,ctx,store}=setup();ctx.window.SupabaseConfig={isConnected:()=>true,getClient:()=>({from:()=>({insert:()=>({select:async()=>({error:new Error('negado')})})})})};const rec=await b.saveProducao({cnes:own.cnes,estabelecimentoNome:own.estabelecimento_nome});assert.equal(rec._localOnly,true);assert.equal(JSON.parse(store.get(b.outboxKey)||'[]').length,1);});
```

- [ ] **Step 5: Rodar tudo e ver passar**

Run: `node --test scripts/tests/bpa-envio-permanente.test.cjs scripts/tests/bpa-access.test.cjs`
Expected: PASS em todos

- [ ] **Step 6: Commit**

```bash
git add code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js scripts/tests/bpa-envio-permanente.test.cjs scripts/tests/bpa-access.test.cjs
git commit -m "feat(bpa): outbox local com retry no load (envio nunca se perde)"
```

---

### Task 4: Delete sem ressurreição + aprovação restaurada após reload

**Files:**
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js` — `deleteProducao` (`:2098-2119`), `setAuditResult` (`:120-131`), novo `buscarAprovacaoSalva`, `handleFileSelect` onload (`:4213`)
- Test: `scripts/tests/bpa-envio-permanente.test.cjs` (anexar)

**Interfaces:**
- Consumes: `this.producoes[].fingerprint/status_auditoria/total_apontamentos/auditado_em`.
- Produces: `buscarAprovacaoSalva(fingerprint)` → objeto approval ou null; `filePendingUpload.fingerprint` carimbado em `setAuditResult`.

- [ ] **Step 1: Escrever os testes que falham (anexar)**

```js
test('delete em modo local não apaga do cache registro que existe na nuvem', async () => {
    const { b } = setup();
    b.persistenceMode = 'local';
    b.producoes = [{ id: 'cloud-1', nome_arquivo: 'A.JUL', estabelecimento_nome: 'HOSPITAL MATERNO INFANTIL', cnes: '2387439', digitador_username: 'admin', digitador_nome: 'Admin' }];
    const ok = await b.deleteProducao('cloud-1');
    assert.equal(ok, false);
    assert.equal(b.producoes.length, 1);
});

test('delete de registro só-local funciona offline', async () => {
    const { b } = setup();
    b.persistenceMode = 'local';
    b.producoes = [{ id: 'loc-1', nome_arquivo: 'A.JUL', estabelecimento_nome: 'HOSPITAL MATERNO INFANTIL', cnes: '2387439', digitador_username: 'admin', digitador_nome: 'Admin', _localOnly: true }];
    const ok = await b.deleteProducao('loc-1');
    assert.equal(ok, true);
    assert.equal(b.producoes.length, 0);
});

test('setAuditResult carimba fingerprint no arquivo pendente', () => {
    const { b } = setup();
    b.filePendingUpload = {};
    b.setAuditResult({ fingerprint: 'fp-1', podeEnviarSemGlosa: true, naoConformidades: 0 });
    assert.equal(b.filePendingUpload.fingerprint, 'fp-1');
    assert.equal(b.canSubmitPendingUpload(), true);
});

test('buscarAprovacaoSalva restaura aprovação pelo fingerprint', () => {
    const { b } = setup();
    b.producoes = [{ id: 'p1', fingerprint: 'fp-1', status_auditoria: 'COM_APONTAMENTOS', total_apontamentos: 4, auditado_em: '2026-09-22T10:00:00.000Z' }];
    const ap = b.buscarAprovacaoSalva('fp-1');
    assert.equal(ap.podeEnviarSemGlosa, false);
    assert.equal(ap.status, 'COM_APONTAMENTOS');
    assert.equal(ap.totalApontamentos, 4);
    assert.equal(b.buscarAprovacaoSalva('outro'), null);
});
```

Nota: `deleteProducao` chama `confirm` e `alert` — o setup da Task 2 já os provê (`confirm: () => true`). Em modo local com admin, `canAccessProducao` precisa retornar true: admin tem visão geral (`isAdminOrFrancileide`), verificar se `canAccessProducao` libera admin — se o teste falhar aí, semear `b.producoes` não basta; ajustar o teste para stubar `b.canAccessProducao = () => true` antes de chamar (documentar no teste).

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/bpa-envio-permanente.test.cjs`
Expected: FAIL (4 testes novos; métodos inexistentes; delete remove mesmo sem nuvem)

- [ ] **Step 3: Implementação mínima**

3a. `deleteProducao`: substituir o bloco `:2098-2119` por:

```js
// Deletar no Supabase se disponível
const alcancaNuvem = !prod._localOnly && this.persistenceMode !== 'local' && window.SupabaseConfig && window.SupabaseConfig.isConnected();
try {
    if (alcancaNuvem) {
        const client = window.SupabaseConfig.getClient();
        if (!client) throw new Error('Conexão indisponível.');
        const { error } = await client.from('producoes_bpa').delete().eq('id', id);
        if (error) throw error;
    } else if (!prod._localOnly) {
        alert('Sem conexão com a nuvem: a produção existe no servidor e não será removida agora. Tente novamente conectado.');
        return false;
    }
} catch (e) {
    alert('Não foi possível excluir a produção na nuvem. Tente novamente.');
    return false;
}

// Deletar apenas o registro autorizado na base local, mantendo os demais.
if (prod._localOnly) {
    try { this.persistLocalProducao(prod, true); }
    catch (error) { alert('Não foi possível remover o arquivo local: ' + error.message); return false; }
}
this.producoes.splice(index, 1);
localStorage.setItem(this.storageKey, JSON.stringify(this.producoes));
```

(mantém o restante — cascata do espelho, render, toast — inalterado.)

3b. `setAuditResult`: após `this.auditApproval = {...}` (antes de `this.atualizarEstadoBotaoEnvio();`, `:130`), inserir:

```js
if (this.filePendingUpload && computed.fingerprint) {
    this.filePendingUpload.fingerprint = computed.fingerprint;
}
```

3c. Novo método após `setAuditResult` (`:131`):

```js
buscarAprovacaoSalva(fingerprint) {
    if (!fingerprint || !Array.isArray(this.producoes)) return null;
    const p = this.producoes.find(x => x && x.fingerprint === fingerprint);
    if (!p) return null;
    return {
        fingerprint: p.fingerprint,
        approvedAt: p.auditado_em ? new Date(p.auditado_em).getTime() : Date.now(),
        podeEnviarSemGlosa: p.status_auditoria === 'CONFORME',
        status: p.status_auditoria || 'COM_APONTAMENTOS',
        totalApontamentos: p.total_apontamentos || 0,
        restaurada: true
    };
},
```

3d. `handleFileSelect` onload: após `this.filePendingUpload = parsed;` (`:4213`), inserir:

```js
try {
    const texto = String(textContent || '');
    const hash = await this.calcularFingerprintTexto(texto);
    if (hash) {
        parsed.fingerprint = hash;
        const salva = this.buscarAprovacaoSalva(hash);
        if (salva) {
            this.auditApproval = salva;
            this.atualizarEstadoBotaoEnvio();
        }
    }
} catch (_e) { /* sem cripto disponível, segue fluxo normal com auditoria */ }
```

3e. Novo método (ao lado de `buscarAprovacaoSalva`):

```js
async calcularFingerprintTexto(texto) {
    try {
        const cryptoObj = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto : (typeof window !== 'undefined' && window.crypto && window.crypto.subtle ? window.crypto : null);
        if (!cryptoObj || !cryptoObj.subtle) return '';
        const bytes = await cryptoObj.subtle.digest('SHA-256', new TextEncoder().encode(String(texto || '')));
        return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
    } catch (e) { return ''; }
},
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test scripts/tests/bpa-envio-permanente.test.cjs scripts/tests/bpa-access.test.cjs`
Expected: PASS em todos

- [ ] **Step 5: Commit**

```bash
git add code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js scripts/tests/bpa-envio-permanente.test.cjs
git commit -m "feat(bpa): delete sem ressurreicao + aprovacao restaurada pelo fingerprint"
```

---

### Task 5: Espelho gravado na nuvem (upsert por produção)

**Files:**
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/producao-profissional-module.js` — `recordProducaoProfissionais` (`:345-356`), `removeProducao` (`:515-536`)
- Test: `scripts/tests/producao-profissional.test.cjs` (anexar; padrão `setup()` com `vm`, `:10-29`)

**Interfaces:**
- Consumes: `SupabaseConfig.isConnected()/getClient()` (guardado); linhas `{producao_id, cnes, competencia, cns_profissional, nome_profissional, cbo, procedimentos, total_quantidade, total_atendimentos, total_valor, digitador_username}`.
- Produces: `mapearRegistroParaLinha(r, producaoId, digitador)` (pura), `mapearLinhaParaRegistro(row)` (pura), `persistirEspelhoNuvem(producaoId, registros, client?)`, `mesclarNuvemLocal(nuvem, local)` (pura).

- [ ] **Step 1: Escrever os testes que falham (anexar)**

```js
test('mapeamento registro<->linha do espelho preserva totais e procedimentos', () => {
    const { mod } = setup();
    const r = {
        producao_id: 'prod-1', cnes: '2387439', competencia: '07/2026',
        cns: '700000000000001', nome: 'Dr. X', cbo: '225125',
        procedimentos: [{ codigo: '0205020046', quantidade: 3, valorUnitario: 10, valorTotal: 30 }],
        totalQuantidade: 3, totalAtendimentos: 2, totalValor: 30
    };
    const linha = mod.mapearRegistroParaLinha(r, 'prod-1', 'jessica');
    assert.equal(linha.cns_profissional, '700000000000001');
    assert.equal(linha.producao_id, 'prod-1');
    assert.deepEqual(JSON.parse(JSON.stringify(linha.procedimentos)), r.procedimentos);
    const volta = mod.mapearLinhaParaRegistro({ ...linha, id: 'uuid-9' });
    assert.equal(volta.id, 'uuid-9');
    assert.equal(volta.totalValor, 30);
    assert.equal(volta.totalAtendimentos, 2);
});

test('mescla nuvem+local: nuvem vence por chave estavel, local preenche lacunas', () => {
    const { mod } = setup();
    const nuvem = [{ id: 'c1', producao_id: 'p1', cns: 'C1', cbo: '', totalValor: 100 }];
    const local = [
        { id: 'l1', producao_id: 'p1', cns: 'C1', cbo: '', totalValor: 50 },
        { id: 'l2', producao_id: 'p2', cns: 'C2', cbo: '', totalValor: 70 }
    ];
    const merged = mod.mesclarNuvemLocal(nuvem, local);
    assert.equal(merged.length, 2);
    assert.equal(merged.find(r => r.producao_id === 'p1').totalValor, 100);
    assert.equal(merged.find(r => r.producao_id === 'p2').id, 'l2');
});

test('recordProducaoProfissionais espelha na nuvem sem quebrar o save local', async () => {
    const { mod, store, ctx } = setup();
    let apagados = 0; let inseridos = null;
    ctx.window.SupabaseConfig = {
        isConnected: () => true,
        getClient: () => ({ from: (tabela) => {
            if (tabela !== 'espelho_producao_profissional') throw new Error('tabela errada: ' + tabela);
            return {
                delete: () => ({ eq: async () => { apagados++; return { error: null }; } }),
                insert: (rows) => { inseridos = rows; return { select: async () => ({ data: rows, error: null }) }; }
            };
        } })
    };
    mod.recordProducaoProfissionais(
        { id: 'prod-1', cnes: '2387439', estabelecimento_nome: 'HMI', competencia: '07/2026', nome_arquivo: 'A.JUL', digitador_username: 'jessica' },
        { cnes: '2387439', estabelecimentoNome: 'HMI', competencia: '07/2026', nomeArquivo: 'A.JUL',
          profissionaisDetalhados: [{ cns: '700000000000001', nome: 'Dr. X', cbo: '225125', quantidade: 3, atendimentos: 2, procedimentos: [{ codigo: '0205020046', quantidade: 3 }] }] }
    );
    await new Promise(r => setTimeout(r, 50));
    const saved = JSON.parse(store.get(mod.storageKey) || '[]');
    assert.equal(saved.length, 1);
    assert.equal(apagados, 1);
    assert.equal(inseridos.length, 1);
    assert.equal(inseridos[0].cns_profissional, '700000000000001');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/producao-profissional.test.cjs`
Expected: FAIL (métodos inexistentes; nuvem não chamada)

- [ ] **Step 3: Implementação mínima**

3a. Funções puras + persistência (inserir antes de `recordProducaoProfissionais`, `:271`):

```js
chaveEstavelRegistro(r) {
    return [r.producao_id || '', r.cns || '', r.cbo || ''].join('|');
},

mapearRegistroParaLinha(r, producaoId, digitador) {
    return {
        producao_id: producaoId || r.producao_id,
        cnes: r.cnes || '',
        competencia: r.competencia || '',
        cns_profissional: r.cns || '',
        nome_profissional: r.nome || '',
        cbo: r.cbo || '',
        procedimentos: Array.isArray(r.procedimentos) ? r.procedimentos : [],
        total_quantidade: r.totalQuantidade || 0,
        total_atendimentos: r.totalAtendimentos || 0,
        total_valor: (typeof r.totalValor === 'number') ? r.totalValor : 0,
        digitador_username: digitador || ''
    };
},

mapearLinhaParaRegistro(row) {
    const r = row || {};
    return {
        id: r.id,
        producao_id: r.producao_id,
        cnes: r.cnes || '',
        competencia: r.competencia || '',
        cns: r.cns_profissional || '',
        nome: r.nome_profissional || '',
        cbo: r.cbo || '',
        procedimentos: Array.isArray(r.procedimentos) ? r.procedimentos : [],
        totalQuantidade: r.total_quantidade || 0,
        totalAtendimentos: r.total_atendimentos || 0,
        totalValor: (typeof r.total_valor === 'number') ? r.total_valor : Number(r.total_valor || 0),
        criado_em: r.criado_em
    };
},

mesclarNuvemLocal(nuvem, local) {
    const mapa = new Map();
    for (const r of (Array.isArray(local) ? local : [])) {
        if (r) mapa.set(this.chaveEstavelRegistro(r), r);
    }
    for (const row of (Array.isArray(nuvem) ? nuvem : [])) {
        const r = this.mapearLinhaParaRegistro(row);
        mapa.set(this.chaveEstavelRegistro(r), { ...r });
    }
    return [...mapa.values()];
},

async persistirEspelhoNuvem(producaoId, registros, clientForcado) {
    if (!producaoId || !Array.isArray(registros)) return false;
    try {
        const g = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
        const client = clientForcado || (g.SupabaseConfig && g.SupabaseConfig.isConnected() && g.SupabaseConfig.getClient());
        if (!client) return false;
        const digitador = registros[0] ? undefined : undefined;
        const linhas = registros.map(r => this.mapearRegistroParaLinha(r, producaoId, (r._digitador || '')));
        const del = await client.from('espelho_producao_profissional').delete().eq('producao_id', producaoId);
        if (del && del.error) throw del.error;
        if (!linhas.length) return true;
        const ins = await client.from('espelho_producao_profissional').insert(linhas).select();
        if (ins && ins.error) throw ins.error;
        return true;
    } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Espelho nuvem adiado:', e.message);
        return false;
    }
},
```

Nota: `digitador` vem do `producaoRecord.digitador_username` — em `recordProducaoProfissionais`, antes de chamar, anexar `r._digitador = producaoRecord.digitador_username || ''` aos records daquela produção (apenas em memória/nuvem; o campo `_digitador` não é persistido localmente — `mapearRegistroParaLinha` lê e ignora o resto). Implementar: no ponto onde `saved.push(...profRecords)` / fallback push ocorre, carimbar `_digitador` em cada item.

3b. Ao final de `recordProducaoProfissionais`, após o `localStorage.setItem` (`:345-349`) e antes de `this.records = saved;` (`:351`), inserir:

```js
try {
    const soDesta = saved.filter(r => r.producao_id === producaoId);
    const p = this.persistirEspelhoNuvem(producaoId, soDesta);
    if (p && typeof p.catch === 'function') p.catch(() => {});
} catch (e) {}
```

3c. `removeProducao`: após o `localStorage.setItem` (`:526-530`), inserir:

```js
try {
    const g = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    if (g.SupabaseConfig && g.SupabaseConfig.isConnected()) {
        const client = g.SupabaseConfig.getClient();
        if (client) {
            const pr = client.from('espelho_producao_profissional').delete().eq('producao_id', producaoId);
            if (pr && typeof pr.catch === 'function') pr.catch(() => {});
        }
    }
} catch (e) {}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test scripts/tests/producao-profissional.test.cjs`
Expected: PASS em todos (incluindo os 3 novos)

- [ ] **Step 5: Commit**

```bash
git add code_sandbox_light_git_fe61910d_1781185357/js/producao-profissional-module.js scripts/tests/producao-profissional.test.cjs
git commit -m "feat(espelho): upsert na nuvem por producao + merge nuvem-local"
```

---

### Task 6: Espelho exibido corretamente (namespace, expurgo, filtros, dedup)

**Files:**
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/producao-profissional-module.js` — `storageKey` (`:8`), `loadData` (`:558-604`), `populateFilterOptions` (`:709-726`), `aggregateProfissionais` resultado (`:482-503`), `getFilteredAndAggregatedProfissionais` (`:751-781`)
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js` — `loadProducoes` final (`:1924`), `saveProducao` (`:2056-2063`), `deleteProducao` (`:2121-2128`)
- Test: `scripts/tests/producao-profissional.test.cjs` (anexar)

**Interfaces:**
- Consumes: `BpaModule.getCurrentUser().username`; flag `ProducaoProfissionalModule.bpaSincronizadoEm` (timestamp setado pelo BPA).
- Produces: `chaveArmazenamento()`; `atendimentosChaves[]` nos records; união cross-remessa na exibição.

- [ ] **Step 1: Escrever os testes que falham (anexar)**

```js
test('chave do espelho isolada por usuario', () => {
    const { mod } = setup();
    mod.chaveArmazenamento('jessica');
    assert.ok(mod.chaveArmazenamento('jessica').includes('jessica'));
    assert.notEqual(mod.chaveArmazenamento('jessica'), mod.chaveArmazenamento('flavia'));
});

test('expurgo de orfaos so roda com BPA sincronizado', async () => {
    const { mod, store } = setup();
    store.set(mod.chaveArmazenamento(), JSON.stringify([{ id: 'x', producao_id: 'sumiu', cns: 'C1' }]));
    mod.bpaSincronizadoEm = 0;
    await mod.loadData();
    let kept = JSON.parse(store.get(mod.chaveArmazenamento()) || '[]');
    assert.equal(kept.length, 1);
    mod.bpaSincronizadoEm = Date.now();
    await mod.loadData();
    kept = JSON.parse(store.get(mod.chaveArmazenamento()) || '[]');
    assert.equal(kept.length, 0);
});

test('atendimentos nao duplicam o mesmo paciente/data entre remessas', () => {
    const { mod } = setup();
    const mk = (pid, chaves, qtd) => ({
        id: pid, producao_id: pid, cns: 'C1', nome: 'Dr. X', cbo: '225125',
        estabelecimento_nome: 'HMI', competencia: '07/2026',
        totalQuantidade: qtd, totalAtendimentos: chaves.length, totalValor: 0,
        procedimentos: [], atendimentosChaves: chaves
    });
    mod.records = [mk('p1', ['PAC1_20260710', 'PAC2_20260710'], 2), mk('p2', ['PAC1_20260710', 'PAC3_20260711'], 2)];
    const lista = mod.getFilteredAndAggregatedProfissionais();
    assert.equal(lista.length, 1);
    assert.equal(lista[0].totalAtendimentos, 3);
    assert.equal(lista[0].totalQuantidade, 4);
});
```

Notas: `loadData` sem DOM precisa dos guards existentes (`populateFilterOptions`/`render` com `getElementById: () => null` — o setup já provê; `render` acessa `getFilteredAndAggregatedProfissionais` + `renderRankingBarras/renderListaProfissionais` que fazem `getElementById` e retornam cedo com null — se algum acesso quebrar no vm, ajustar o teste com `mod.render = () => {}` antes de `loadData`, e chamar `getFilteredAndAggregatedProfissionais` direto onde preciso).

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/producao-profissional.test.cjs`
Expected: FAIL (métodos/campos inexistentes)

- [ ] **Step 3: Implementação mínima**

3a. Namespace (após `storageKey: ...`, `:8`):

```js
chaveArmazenamento(username) {
    let user = username;
    if (!user && typeof window !== 'undefined' && window.BpaModule && typeof window.BpaModule.getCurrentUser === 'function') {
        try { user = window.BpaModule.getCurrentUser().username; } catch (e) {}
    }
    user = String(user || '').trim().toLowerCase();
    return user ? (this.storageKey + ':' + user) : this.storageKey;
},
```

Trocar **todos** os usos de `localStorage.getItem/setItem/removeItem(this.storageKey` em `recordProducaoProfissionais` (`:282,346`), `removeProducao` (`:519,527`), `loadData` (`:561,603`), `clearAllData` (`:543`) por `this.chaveArmazenamento()`. (São 7 ocorrências: `:282, :346, :519, :527, :543, :561, :603`.)

3b. Expurgo condicionado em `loadData`: substituir

```js
// EXPURGO ATIVO DE ÓRFÃOS: remove do Espelho registros de produções que já foram deletadas do BPA
if (existingBpa.length > 0) {
    loaded = loaded.filter(r => validBpaIds.has(r.producao_id));
}
```

(`:571-574`) por:

```js
// EXPURGO DE ÓRFÃOS somente com lista BPA sincronizada: sem isso, init/logout esvaziariam o espelho à toa
const bpaPronto = Number(this.bpaSincronizadoEm || 0) > 0;
if (bpaPronto && existingBpa.length > 0) {
    loaded = loaded.filter(r => validBpaIds.has(r.producao_id));
}
```

E em `loadData`, após carregar da nuvem (Task 5): `loaded = this.mesclarNuvemLocal(nuvemRows, loaded);` — inserir a leitura nuvem logo após o bloco try/catch do `localStorage` (`:560-565`):

```js
let nuvemRows = [];
try {
    const g = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    if (g.SupabaseConfig && g.SupabaseConfig.isConnected()) {
        const client = g.SupabaseConfig.getClient();
        if (client) {
            const res = await client.from('espelho_producao_profissional').select('*').order('criado_em', { ascending: false }).limit(5000);
            if (res && !res.error && Array.isArray(res.data)) nuvemRows = res.data;
        }
    }
} catch (e) {}
loaded = this.mesclarNuvemLocal(nuvemRows, loaded);
```

3c. Sinalizar sincronização no BPA: em `bpa-module.js`, ao final de `loadProducoes` (após `this.producoes = loaded;`, `:1924`), inserir:

```js
try {
    const g = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    if (g.ProducaoProfissionalModule) g.ProducaoProfissionalModule.bpaSincronizadoEm = Date.now();
} catch (e) {}
```

E repetir o mesmo bloco após `recordProducaoProfissionais` em `saveProducao` (`:2056-2063`, dentro do try existente — acrescentar a flag) e após `removeProducao` em `deleteProducao` (`:2121-2128`, dentro do try existente).

3d. Competências reais em `populateFilterOptions`: remover as linhas

```js
// Default competencies
['06/2026', '07/2026', '08/2026'].forEach(c => compSet.add(c));
```

(`:716-717`).

3e. Persistir chaves de atendimento: em `aggregateProfissionais`, no `result.push` (`:482-503`), acrescentar após `totalAtendimentos,`:

```js
atendimentosChaves: item.isConsolidadoBpaC ? [] : [...item.atendimentosSet],
```

3f. União cross-remessa em `getFilteredAndAggregatedProfissionais`: no objeto do `profMap.set` (`:756-769`), acrescentar `chavesAtend: new Set(), temChaves: false,`; após `agg.totalValor += ...` (`:781`), inserir:

```js
if (Array.isArray(r.atendimentosChaves) && r.atendimentosChaves.length) {
    agg.temChaves = true;
    r.atendimentosChaves.forEach(k => agg.chavesAtend.add(String(k)));
}
```

E no objeto final da lista (`:808-825`), trocar `totalAtendimentos: prof.totalAtendimentos,` por `totalAtendimentos: prof.temChaves ? Math.max(1, prof.chavesAtend.size) : prof.totalAtendimentos,`.

- [ ] **Step 4: Rodar tudo e ver passar**

Run: `node --test scripts/tests/producao-profissional.test.cjs scripts/tests/bpa-envio-permanente.test.cjs scripts/tests/bpa-access.test.cjs scripts/tests/bpa-audit.test.cjs scripts/tests/pente-fino-regras.test.cjs`
Expected: PASS em todos, exceto o teste pré-existente `bpa-access.test.cjs` "ADM e Francileide têm visão geral" (21 vs 22), que já falha no código intacto — não mexer.

- [ ] **Step 5: Commit**

```bash
git add code_sandbox_light_git_fe61910d_1781185357/js/producao-profissional-module.js code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js scripts/tests/producao-profissional.test.cjs
git commit -m "feat(espelho): namespace por usuario, expurgo seguro, filtros reais, dedup"
```

---

## Self-Review

**1. Cobertura da spec:** §3 migration→Task 1 ✓; §4 outbox+cache+delete→Tasks 3–4 ✓ (insert com auditoria→Task 2); §5 restore→Task 4 ✓; §6 escrita/leitura/namespace/expurgo/exibição→Tasks 5–6 ✓; §7 testes→Tasks 2–6 ✓. Requisito "IDs/campos novos da Task 5 usados na 6" ✓ (`mesclarNuvemLocal`, `bpaSincronizadoEm`).

**2. Placeholders:** nenhum "TODO/TBD"; todos os steps trazem código exato e comandos `node --test`; o Step 2 da Task 1 usa verificação por `node -e` (com aspas simples externas — em PowerShell, trocar para arquivo `.cjs` se a citação quebrar).

**3. Consistência de tipos:** `reenviarOutbox()` retorna `{enviados, falhas}` (Task 3 teste confere); `buscarAprovacaoSalva` retorna approval-shape igual ao de `setAuditResult` (`fingerprint/approvedAt/podeEnviarSemGlosa/status/totalApontamentos`); `mapearLinhaParaRegistro` devolve shape de record (`totalQuantidade` etc.); `chaveEstavelRegistro` = `producao_id|cns|cbo` usada igual em `mesclarNuvemLocal`.
