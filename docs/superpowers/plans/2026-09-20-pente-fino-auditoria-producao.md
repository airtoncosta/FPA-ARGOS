# Pente Fino ARGOS — Auditoria de Produção Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer as cinco regras do Pente Fino aprovarem somente uma produção BPA comprovadamente conforme pelas fontes dos menus SIGTAP e CNES & Vínculos da mesma competência.

**Architecture:** `BpaAuditCore` será a única camada que produz achados por linha, com estados explícitos `CONFORME`, `NAO_CONFORME`, `NAO_VERIFICADO` e `NAO_APLICAVEL`. `SigtapAuditApi` fornecerá exclusivamente relações oficiais completas e `PenteFinoEngine` transformará qualquer achado pendente, alerta ou erro estrutural em bloqueio do envio. A UI 3D e a UI comum usarão o mesmo parecer final.

**Tech Stack:** JavaScript ES2019 em navegador, Node.js `node:test`, JSON/Fetch para fontes CNES e SIGTAP.

**Spec:** `docs/superpowers/specs/2026-09-20-pente-fino-auditoria-producao-design.md`

## Global Constraints

- Usar SIGTAP para procedimento, CBO, CID e par serviço/classificação; relações estáticas locais nunca podem autorizar uma regra.
- Usar CNES & Vínculos apenas para CNS na unidade e competência; não exigir situação, desligamento, serviço ou habilitação CNES.
- Regra 4 é somente SIGTAP: validar o par informado contra a lista oficial do procedimento.
- `NAO_VERIFICADO`, `ALERTA`, duplicidade, erro estrutural ou falha em uma regra aplicável bloqueiam o envio.
- `NAO_APLICAVEL` só é aceito quando a relação SIGTAP completa prova que a regra não se aplica.
- Não usar aliases hardcoded, `cns_<CNS>` global, outra competência, campos sintéticos ou `KNOWN_PROCS` para aprovar.
- Preservar alterações preexistentes no checkout. Antes de cada commit, revisar os hunks e adicionar apenas mudanças comprovadamente produzidas por esta implementação.

---

### Task 1: Contrato das fontes e regras determinísticas no core

**Files:**

- Modify: `scripts/tests/bpa-audit.test.cjs`
- Modify: `scripts/tests/pente-fino-regras.test.cjs`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/bpa-audit-core.js`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/sigtap-audit-api.js`

**Interfaces:**

- Consumes: `BpaAuditCore.audit(parsedOrText, bases)` where `bases[competencia].cnes` has `oficial`, `completo`, `cobertura.profissionais`, `estabelecimentos`, and `bases[competencia].sigtap.procedimentos[codigo]` has each relation plus `cobertura`.
- Produces: findings with `regra`, `status`, `linha`, `competencia`, `cnes`, `procedimento`, `esperado`, and `encontrado`.
- Produces: `SigtapAuditApi.load(records, fetcher)` whose returned relations are marked complete only after every paginated page for the requested competence is validated.

- [ ] **Step 1: Write failing Rule 1 tests that use only same-CNES CNS evidence**

Add fixture helpers to `scripts/tests/bpa-audit.test.cjs` and tests whose expected results distinguish a declared alias from a global fallback:

```js
const finding = (result, regra) => result.findings.find(item => item.regra === regra);

test('Regra 1 confirma CNS na mesma unidade sem exigir situação ou CBO CNES', () => {
  const base = bases();
  base['202608'].cnes.estabelecimentos[0].profissionais = [{
    cns, cbo: '999999', situacao: 'DESLIGADO', compDesativacao: '202607'
  }];
  const result = run({}, base);
  assert.equal(finding(result, 'VINCULO_PROFISSIONAL'), undefined);
});

test('Regra 1 não aceita CNS existente apenas em outro CNES ou mapa global', () => {
  const base = bases();
  base['202608'].cnes.estabelecimentos[0].profissionais = [];
  base['202608'].cnes.estabelecimentos.push({ cnes: '7654321', profissionais: [{ cns }] });
  base['202608'].cnes.mapaVinculos = { [`cns_${cns}`]: { cnes: '7654321' } };
  const result = run({}, base);
  assert.equal(finding(result, 'VINCULO_PROFISSIONAL').status, 'NAO_CONFORME');
});
```

Add a third test where `unit.aliases: ['7654321']` exists in the `202608` fixture and passes, then verify the same alias absent from the `202608` fixture fails even if it existed in a distinct fixture competence.

- [ ] **Step 2: Run the new Rule 1 tests to verify they fail**

Run:

```powershell
node --test scripts/tests/bpa-audit.test.cjs --test-name-pattern "Regra 1"
```

Expected: the current implementation fails because it requires active/CBO fields and accepts global `cns_<CNS>` or hardcoded aliases.

- [ ] **Step 3: Implement exact CNES matching without synthetic activity rules**

In `bpa-audit-core.js`, replace the unit/professional match with explicit helpers:

```js
const digits = value => String(value ?? '').replace(/\D/g, '');
const matchesUnit = (unit, cnes) => String(unit.cnes) === cnes ||
  (Array.isArray(unit.aliases) && unit.aliases.map(String).includes(cnes));
const matchesProfessionalCns = (professional, cns) =>
  [professional.cns, professional.cnsMaster].some(value => digits(value) === cns);
```

Use `matchesUnit` only against `cnesBase.estabelecimentos` for the requested competence. For BPA-I, mark `VINCULO_PROFISSIONAL` `CONFORME` whenever an exact CNS match exists in that unit; do not inspect CBO, `ativo`, `situacao`, `compDesativacao`, `cpf`, `mapaVinculos`, or global aliases. If coverage is complete and no CNS exists, use `NAO_CONFORME`; otherwise use `NAO_VERIFICADO`.

- [ ] **Step 4: Write failing CBO, CID, and SIGTAP-only Rule 4 tests**

Replace the contradictory CBO alphanumeric test and CNES-service test in `scripts/tests/bpa-audit.test.cjs` with this matrix:

```js
test('CBO exige exatamente seis dígitos', () => {
  for (const cbo of ['2231A1', '12345', '1234567', '']) {
    assert.equal(finding(run({ cbo }), 'CBO_FORMATO').status, 'NAO_CONFORME');
  }
});

test('CID vazio só é não aplicável quando relação completa não possui CID', () => {
  const base = bases();
  base['202608'].sigtap.procedimentos['0301010072'].cids = [];
  assert.equal(run({ cid: '' }, base).findings.some(f => f.regra === 'CID'), false);
  delete base['202608'].sigtap.procedimentos['0301010072'].cobertura.cids;
  assert.equal(finding(run({ cid: '' }, base), 'CIDS').status, 'NAO_VERIFICADO');
});

test('Regra 4 depende somente do par SIGTAP', () => {
  const base = bases();
  base['202608'].cnes.cobertura.servicos = false;
  base['202608'].sigtap.procedimentos['0301010072'].servicos = [{ servico: '121', classificacao: '003' }];
  const ok = run({ servico: '121', classificacao: '003' }, base);
  assert.equal(ok.findings.some(f => f.regra === 'SERVICO_CNES' || f.regra === 'HABILITACAO'), false);
});
```

Add cases for a mismatched pair, missing service or classification, relation coverage absent, and numeric source values `{servico: 121, classificacao: '003'}` matching the BPA string `'121'/'003'` without converting `'003'` into `'3'`.

- [ ] **Step 5: Run the Rule 2–4 tests to verify they fail**

Run:

```powershell
node --test scripts/tests/bpa-audit.test.cjs --test-name-pattern "CBO|CID|Regra 4"
```

Expected: failures because CBO accepts letters, missing coverage is not consistently mapped, and Rule 4 still emits CNES service/habilitation findings.

- [ ] **Step 6: Implement SIGTAP-only relation checks and eliminate local authorization data**

In `bpa-audit-core.js`:

```js
const normalizedCode = value => String(value ?? '').trim();
const sigtapPair = value => `${normalizedCode(value.servico)}/${normalizedCode(value.classificacao)}`;
```

Require `/^\d{6}$/` for CBO. Keep CID `NAO_APLICAVEL` only if `cobertura.cids === true` and the official list is empty; otherwise emit `NAO_VERIFICADO`. For services, create only `SERVICO_INFORMADO` (or `SERVICO_CLASSIFICACAO`) findings from the SIGTAP relation and remove all `SERVICO_CNES` and `HABILITACAO` checks from this production path.

In `sigtap-audit-api.js`, delete `KNOWN_PROCS` and its early return. Always request the procedure and its paginated relations, retain `proc.cobertura[key] = false` upon an incomplete relation, and expose a source entry that identifies the actual SIGTAP API request and competence.

- [ ] **Step 7: Run the focused core suite and inspect source fallback removal**

Run:

```powershell
node --test scripts/tests/bpa-audit.test.cjs
rg -n "KNOWN_PROCS|cns_\$|2458055_|2387412_|SERVICO_CNES|HABILITACAO" code_sandbox_light_git_fe61910d_1781185357/js/bpa-audit-core.js code_sandbox_light_git_fe61910d_1781185357/js/sigtap-audit-api.js
```

Expected: all core tests pass; the search has no authorization fallback hit, with only deliberate labels outside the production-rule code allowed.

- [ ] **Step 8: Commit only reviewed Task 1 hunks**

Review the preexisting dirty diff first, stage only the new tests and core/API hunks, then commit:

```powershell
git diff -- scripts/tests/bpa-audit.test.cjs code_sandbox_light_git_fe61910d_1781185357/js/bpa-audit-core.js code_sandbox_light_git_fe61910d_1781185357/js/sigtap-audit-api.js
git add -p -- scripts/tests/bpa-audit.test.cjs code_sandbox_light_git_fe61910d_1781185357/js/bpa-audit-core.js code_sandbox_light_git_fe61910d_1781185357/js/sigtap-audit-api.js
git commit -m "fix(audit): use canonical CNES and SIGTAP rule evidence"
```

### Task 2: Consolidação fail-closed das cinco regras

**Files:**

- Modify: `scripts/tests/pente-fino-regras.test.cjs`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-engine.js`

**Interfaces:**

- Consumes: the complete `BpaAuditCore.audit()` result.
- Produces: `classificar5Regras(result)` with five rule objects `{ id, codigo, titulo, descricao, estado, ok, bloqueiaEnvio, findings, totalGlosas }` and `parecer` `{ podeEnviarSemGlosa, status, totalGlosas, totalPendencias, regrasComGlosa, regrasPendentes, mensagem }`.
- Produces: `PenteFinoEngine.getUltimoResultado()` and `PenteFinoEngine.renderizarResultados()` as public methods used by the 3D renderer.

- [ ] **Step 1: Write failing aggregation tests**

Add cases that supply synthetic findings and assert a conservative result:

```js
test('parecer bloqueia NAO_VERIFICADO, ALERTA e falha estrutural', () => {
  const base = { status: 'INCONCLUSIVO', findings: [
    { regra: 'CID', status: 'NAO_VERIFICADO' },
    { regra: 'DUPLICIDADE', status: 'ALERTA' },
    { regra: 'ESTRUTURA', status: 'NAO_CONFORME' }
  ] };
  const result = penteFinoEngine.classificar5Regras(base);
  assert.equal(result.podeEnviarSemGlosa, false);
  assert.equal(result.parecer.status, 'BLOQUEADO');
});

test('NAO_APLICAVEL comprovado não bloqueia lote conforme', () => {
  const result = penteFinoEngine.classificar5Regras({ status: 'CONFORME', findings: [] });
  assert.equal(result.podeEnviarSemGlosa, true);
});
```

Add explicit test that Rule 4 only consumes `SERVICO_INFORMADO` / `SERVICO_CLASSIFICACAO`, never `SERVICO_CNES` or `HABILITACAO`; add test that `ARQUIVO`/`BASE_SIGTAP`/`BASE_CNES` pending states block the global verdict.

- [ ] **Step 2: Run aggregation tests to verify they fail**

Run:

```powershell
node --test scripts/tests/pente-fino-regras.test.cjs --test-name-pattern "parecer|bloqueia|NAO_APLICAVEL"
```

Expected: the current engine can approve with unclassified pending findings and has no `BLOQUEADO` state.

- [ ] **Step 3: Implement a single mapping from findings to rule state**

In `pente-fino-engine.js`, define all mappings in one immutable table:

```js
const RULES = Object.freeze({
  regra1_lotacao_cnes: ['BASE_CNES', 'UNIDADE_CNES', 'VINCULO_PROFISSIONAL'],
  regra2_cbo_procedimento: ['BASE_SIGTAP', 'PROCEDIMENTO_VIGENTE', 'CBO_FORMATO', 'CBO_SIGTAP'],
  regra3_cid_procedimento: ['BASE_SIGTAP', 'PROCEDIMENTO_VIGENTE', 'CID_FORMATO', 'CID'],
  regra4_servico_classificacao: ['BASE_SIGTAP', 'PROCEDIMENTO_VIGENTE', 'SERVICO_INFORMADO', 'SERVICO_CLASSIFICACAO'],
  regra5_cns_profissional: ['CNS_PROFISSIONAL']
});
```

For each rule, derive `estado` in priority order `NAO_CONFORME`, `NAO_VERIFICADO`, `ALERTA`, `CONFORME`, `NAO_APLICAVEL`. A global finding not owned by a rule (`ESTRUTURA`, `ARQUIVO`, `DUPLICIDADE`, layout/data errors) becomes a blocking `outrasOcorrencias`. `avaliarParecerFinal()` must return `APROVADO` only when every applicable rule is conforming and no blocker exists; otherwise return `BLOQUEADO` for incompleteness/alert or `GLOSA_DETECTADA` for proven nonconformance.

- [ ] **Step 4: Expose a canonical result and remove duplicated audit paths**

Refactor `executar()` and `executarComAnimacao3D()` to call one internal function:

```js
async function executarAuditoria(selected, onProgress = () => {}) {
  // parse -> loadBases -> SigtapAuditApi.load -> auditar5Regras -> enrich source/fingerprint
  // set ultimoResultado only after the complete result exists
}
```

Set and clear `executando` around this single function so a second click cannot start a competing audit. Export `getUltimoResultado: () => ultimoResultado` and `renderizarResultados` in the returned API.

- [ ] **Step 5: Run engine and core regression tests**

Run:

```powershell
node --test scripts/tests/bpa-audit.test.cjs scripts/tests/pente-fino-regras.test.cjs
```

Expected: every test passes and all negative/pending states report `podeEnviarSemGlosa: false`.

- [ ] **Step 6: Commit only reviewed Task 2 hunks**

```powershell
git diff -- scripts/tests/pente-fino-regras.test.cjs code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-engine.js
git add -p -- scripts/tests/pente-fino-regras.test.cjs code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-engine.js
git commit -m "fix(pente-fino): block unverified and alerting audits"
```

### Task 3: Canonical UI gate, 3D diagnosis, and CNS masking

**Files:**

- Modify: `scripts/tests/pente-fino-regras.test.cjs`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-engine.js`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-3d-renderer.js`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/index.html`

**Interfaces:**

- `BpaModule.canSubmitPendingUpload()` returns `true` only when the current file fingerprint matches a currently approved Pente Fino result.
- `BpaModule.handleFormSubmit()` must stop before persistence when `canSubmitPendingUpload()` is false.
- `PenteFino3DRenderer.confirmarEnvioDireto()` must call the same `BpaModule` submission path, never a guessed DOM id or a direct storage write.

- [ ] **Step 1: Write failing source-level UI gate tests**

Use the current Node test file to load source text and assert the public integration points:

```js
test('UI exporta renderização e usa o gate canônico de envio BPA', () => {
  const engineSource = fs.readFileSync(path.join(basePath, 'js/pente-fino-engine.js'), 'utf8');
  const rendererSource = fs.readFileSync(path.join(basePath, 'js/pente-fino-3d-renderer.js'), 'utf8');
  const moduleSource = fs.readFileSync(path.join(basePath, 'js/bpa-module.js'), 'utf8');
  assert.match(engineSource, /renderizarResultados\s*,/);
  assert.match(moduleSource, /canSubmitPendingUpload/);
  assert.match(rendererSource, /BpaModule\.handleFormSubmit\(\)/);
});
```

Add tests that a rejected, inconclusive, or stale-fingerprint result cannot invoke the save path, while an approved result with the same fingerprint can. Add a unit test for `mascararCns('700000000000005') === '700*********005'` and assert renderer/result templates use the masked value, not `finding.cns` verbatim.

- [ ] **Step 2: Run UI gate tests to verify they fail**

Run:

```powershell
node --test scripts/tests/pente-fino-regras.test.cjs --test-name-pattern "UI|gate|mascarar"
```

Expected: current source lacks exported `renderizarResultados`, has no canonical `canSubmitPendingUpload`, and calls an incorrect/noncanonical send target.

- [ ] **Step 3: Implement fingerprint-bound gate in `BpaModule`**

Store only audit metadata for the selected upload:

```js
this.penteFinoApproval = { fingerprint, approvedAt, podeEnviarSemGlosa };
canSubmitPendingUpload() {
  return this.penteFinoApproval?.podeEnviarSemGlosa === true &&
    this.penteFinoApproval.fingerprint === this.currentFileFingerprint();
}
```

Clear `penteFinoApproval` in `handleFileSelect()`, `closeUploadModal()`, and any operation that replaces the pending file. At the beginning of `handleFormSubmit()`, display a clear message and return if the gate fails. Only enable `#btnConfirmarUploadBpa` after an approved result is received; keep the audit button available whenever a valid file is selected.

- [ ] **Step 4: Connect both views to the same result**

After `executarAuditoria()` resolves, pass its fingerprint and verdict to `BpaModule.registrarParecerPenteFino(result)`. In the 3D renderer, replace DOM-id guessing with:

```js
if (window.BpaModule && typeof window.BpaModule.handleFormSubmit === 'function') {
  return window.BpaModule.handleFormSubmit();
}
```

Only render its send button when `result.podeEnviarSemGlosa === true`. Export `renderizarResultados`; `abrirDiagnosticoCompleto()` must invoke it and show the same findings. Update Rule 4 labels from “no CNES” to “no SIGTAP”. Mask CNS with a pure `mascararCns()` helper before HTML interpolation and CSV/Excel export.

- [ ] **Step 5: Run focused UI tests and all audit tests**

Run:

```powershell
node --test scripts/tests/pente-fino-regras.test.cjs
node --test scripts/tests/bpa-audit.test.cjs
```

Expected: the public renderer, direct-confirmation path, stale result rejection, and masking are all covered and passing.

- [ ] **Step 6: Commit only reviewed Task 3 hunks**

```powershell
git diff -- scripts/tests/pente-fino-regras.test.cjs code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-engine.js code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-3d-renderer.js code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js code_sandbox_light_git_fe61910d_1781185357/index.html
git add -p -- scripts/tests/pente-fino-regras.test.cjs code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-engine.js code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-3d-renderer.js code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js code_sandbox_light_git_fe61910d_1781185357/index.html
git commit -m "fix(bpa): gate submission on approved Pente Fino audit"
```

### Task 4: Regression verification and review

**Files:**

- Test: `scripts/tests/bpa-audit.test.cjs`
- Test: `scripts/tests/pente-fino-regras.test.cjs`
- Test: `scripts/tests/bpa-access.test.cjs`
- Test: `scripts/tests/bpa-profissionais-ui.test.cjs`

**Interfaces:**

- Produces: a verified working tree where the auditor and UI pass all current checks without claiming approval on incomplete source data.

- [ ] **Step 1: Execute the complete BPA regression suite**

Run:

```powershell
node --test scripts/tests/bpa-audit.test.cjs scripts/tests/pente-fino-regras.test.cjs scripts/tests/bpa-access.test.cjs scripts/tests/bpa-profissionais-ui.test.cjs
```

Expected: zero failures.

- [ ] **Step 2: Check the critical source invariants**

Run:

```powershell
rg -n "KNOWN_PROCS|cns_\$\{|2458055_\$\{|2387412_\$\{|SERVICO_CNES|HABILITACAO" code_sandbox_light_git_fe61910d_1781185357/js
rg -n "podeEnviarSemGlosa|BLOQUEADO|canSubmitPendingUpload|mascararCns" code_sandbox_light_git_fe61910d_1781185357/js
```

Expected: no approval fallback; expected gate/masking calls appear in their canonical modules.

- [ ] **Step 3: Review diff boundaries before final commit**

Run:

```powershell
git diff --check
git diff --name-only
git diff --cached --name-only
```

Expected: no whitespace errors; every staged file/hunk belongs to this work. Leave unrelated CNES data, styling, scratch scripts, and user changes unstaged.

- [ ] **Step 4: Request code review and report evidence**

Use a fresh reviewer to inspect the final diff for requirement coverage, false-positive paths, false-negative paths, and regression risks. Correct any verified finding, rerun the commands above, and only then report completion.
