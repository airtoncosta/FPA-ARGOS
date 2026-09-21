# Envio de Produção BPA com Recepção e Auditoria Integrada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o envio de produção ambulatorial BPA com resolução de aliases CNES, exibição de CNS desmascarado (15 dígitos), detalhamento de procedimentos e total por profissional, cálculo em R$ SIGTAP e gating de envio com Recepção Integrada no Espelho de Produção.

**Architecture:** O `BpaModule` resolve unidades por CNES e aliases para eliminar falsos positivos de vínculo na prévia; renderiza o CNS completo de 15 dígitos e a distribuição de procedimentos por médico; calcula o valor estimado em R$ da produção; e implementa a política de Recepção Integrada, onde a auditoria prévia do `PenteFinoEngine` é mandatória para gerar parecer e rastreabilidade, liberando o botão de envio contextual para gravação com carimbo no Espelho de Produção.

**Tech Stack:** JavaScript Vanilla (ES2019 / Browser), Node.js `node:test` para TDD, CSS customizado responsivo e tabelas de compatibilidade SIGTAP e CNES.

**Spec:** `docs/superpowers/specs/2026-09-20-envio-producao-bpa-recepcao-integrada-design.md`

## Global Constraints

- Reconhecer unidades tanto pelo CNES oficial quanto por `aliases` (ex: `2458055` com alias `2387412` para o Hospital Maria Socorro Brandão).
- O CNS do profissional no Raio-X do modal de upload deve exibir todos os 15 dígitos reais sem máscara de asteriscos.
- Cada profissional identificado deve listar seus procedimentos individuais e quantidades, além do volume total de atendimentos.
- O valor financeiro estimado (R$ SIGTAP) deve ser calculado e exibido imediatamente na prévia do arquivo.
- O botão `#btnConfirmarUploadBpa` deve exigir a execução prévia da auditoria do Pente Fino, mas uma vez concluída a auditoria, deve permitir a submissão tanto para lotes 100% conformes quanto para lotes com apontamentos de risco (Recepção Integrada).
- Preservar retrocompatibilidade com todas as chamadas de API, suítes de teste de acesso e regras existentes.

---

### Task 1: Resolução Dinâmica de Vínculos de TODOS os Profissionais por Unidade e Competência (com Glosa se Ausente), CNS Desmascarado (15 dígitos) e Procedimentos

**Files:**
- Create: `scripts/tests/bpa-recepcao-integrada.test.cjs`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js:1054-1265`

**Interfaces:**
- Consumes: `bpaModule.lookupProfissional(cns, cnes, competencia)` e `bpaModule.formatProfissionaisAmostra(profissionaisDetalhados)`.
- Produces: `bpaModule.lookupProfissional` genérico para qualquer arquivo e profissional de qualquer estabelecimento e competência.
  - Se o profissional está cadastrado na unidade naquela competência (considerando CNES e aliases): `vinculadoUnidade = true` (Selo Verde de Vínculo Confirmado).
  - Se o profissional NÃO está cadastrado naquela unidade naquela competência: `vinculadoUnidade = false` (Alerta Vermelho de Glosa por Falta de Vínculo).
  - `formatProfissionaisAmostra`: renderiza todos os 15 dígitos do CNS sem máscara de asteriscos, exibe o status de vínculo ou glosa, e lista todos os procedimentos individuais com suas quantidades e o total do profissional.

- [ ] **Step 1: Escrever testes que falham para resolução com aliases e CNS completo**

Criar `scripts/tests/bpa-recepcao-integrada.test.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const basePath = path.resolve(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357');
const bpaModule = require(path.join(basePath, 'js/bpa-module.js'));

test('lookupProfissional reconhece profissional em unidade com aliases históricos', () => {
    bpaModule.cnesBaseCache = {
        estabelecimentos: [{
            cnes: '2458055',
            nomeFantasia: 'HOSPITAL MARIA SOCORRO BRANDAO',
            aliases: ['2387412'],
            profissionais: [{
                nome: 'JOSE AMORIM PEREIRA FILHO',
                cns: '700505151875353',
                cbo: '225320',
                ocupacao: 'MEDICO RADIOLOGISTA'
            }]
        }]
    };

    const res = bpaModule.lookupProfissional('700505151875353', '2387412');
    assert.ok(res, 'Profissional deve ser encontrado');
    assert.strictEqual(res.nome, 'JOSE AMORIM PEREIRA FILHO');
    assert.strictEqual(res.vinculadoUnidade, true, 'Deve confirmar vínculo na unidade pelo alias');
});

test('formatProfissionaisAmostra exibe os 15 dígitos do CNS sem máscara e lista procedimentos', () => {
    const profs = [{
        nome: 'AMANDA ALMEIDA MIRANDA',
        cns: '700001311387700',
        cbo: '225320',
        cboDesc: '225320 - MEDICO RADIOLOGISTA',
        vinculadoUnidade: true,
        quantidade: 342,
        procedimentos: [
            { codigo: '0206030037', quantidade: 69 },
            { codigo: '0206010079', quantidade: 67 }
        ]
    }];

    const htmlCards = bpaModule.formatProfissionaisAmostra(profs);
    assert.ok(htmlCards.length === 1);
    const card = htmlCards[0];
    assert.ok(card.includes('700001311387700'), 'Deve conter os 15 dígitos exatos do CNS');
    assert.ok(!card.includes('700*********700'), 'Não deve conter máscara com asteriscos');
    assert.ok(card.includes('0206030037'), 'Deve listar o procedimento 0206030037');
    assert.ok(card.includes('69'), 'Deve exibir a quantidade 69');
    assert.ok(card.includes('Vínculo Confirmado no CNES'), 'Deve conter o selo de vínculo confirmado');
});
```

- [ ] **Step 2: Executar os novos testes para confirmar a falha inicial (RED)**

```powershell
node --test scripts/tests/bpa-recepcao-integrada.test.cjs
```
Esperado: Falha devido à ausência de verificação de `aliases` e presença de máscara de asteriscos.

- [ ] **Step 3: Implementar a resolução de aliases e exibição desmascarada**

Em `bpa-module.js`:
1. Na função `lookupProfissional(cns, cnes)`:
   - Comparar `cleanCnes` contra `est.cnes` e `est.aliases`:
   ```javascript
   const matchesCnes = (est, targetCnes) => {
       if (!est || !targetCnes) return false;
       const c1 = String(est.cnes || '').replace(/\D/g, '');
       if (c1 && c1 === targetCnes) return true;
       if (Array.isArray(est.aliases)) {
           return est.aliases.some(a => String(a).replace(/\D/g, '') === targetCnes);
       }
       return false;
   };
   ```
   - Aplicar `matchesCnes` para localizar a unidade alvo e definir `vinculadoUnidade = matchesCnes(unitFound, cleanCnes)`.
2. Na função `formatProfissionaisAmostra(profissionaisDetalhados)`:
   - Substituir `this.mascararCns(prof.cns)` por `prof.cns` na renderização do badge do operador.
   - Renderizar os badges com código e quantidade para todos os procedimentos individuais do médico.

- [ ] **Step 4: Executar os testes para confirmar o sucesso (GREEN)**

```powershell
node --test scripts/tests/bpa-recepcao-integrada.test.cjs
```
Esperado: 2 testes aprovados com sucesso.

- [ ] **Step 5: Commit atômico da Task 1**

```powershell
git add code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js scripts/tests/bpa-recepcao-integrada.test.cjs
git commit -m "feat(bpa): resolver vinculos com aliases CNES e exibir CNS desmascarado com procedimentos"
```

---

### Task 2: Precificação Estimada Imediata em R$ (SIGTAP) no Raio-X da Produção

**Files:**
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js:930-1050`
- Modify: `scripts/tests/bpa-recepcao-integrada.test.cjs`

**Interfaces:**
- Consumes: Procedimentos extraídos em `parseBpaFile` e tabela de valores SA.
- Produces: `parsed.valorTotalEstimado` (numérico) e `parsed.valorTotalFormatado` (ex: `R$ 66.941,28 (SIGTAP Estimado)`).

- [ ] **Step 1: Escrever teste de precificação imediata no arquivo de teste**

Adicionar a `scripts/tests/bpa-recepcao-integrada.test.cjs`:

```javascript
test('parseBpaFile calcula valor financeiro estimado da produção em R$ com base no SIGTAP', () => {
    const rawContent = '01#BPA#2026080006870000022458055HOSPITAL MARIA DO SOCORRO BRANDAO 02.00\r\n' +
        '0324580552026082253200206010079000100101M700001311387700\r\n';
    const fakeFile = { name: 'PATOMO08.AGO', size: 1024 };

    // Tabela simulada com valor SA para 0206010079 = 97.44
    const parsed = bpaModule.parseBpaFile(fakeFile, rawContent);
    assert.ok(parsed.totalAtendimentos >= 1);
    assert.ok(parsed.valorTotalFormatado.includes('R$'), 'Deve conter símbolo de Real formatado');
    assert.ok(!parsed.valorTotalFormatado.includes('Disponível após auditoria'), 'Não deve postergar a exibição do valor');
});
```

- [ ] **Step 2: Executar teste e validar a falha (RED)**

```powershell
node --test scripts/tests/bpa-recepcao-integrada.test.cjs
```
Esperado: Falha porque `valorTotalFormatado` atualmente retorna `'Disponível após auditoria da competência'`.

- [ ] **Step 3: Implementar precificação no `parseBpaFile`**

Em `bpa-module.js`:
- Consultar a base `sigtap_compatibilidades.json` ou tabela de procedimentos da competência para obter `valorSa`.
- Calcular o somatório: `sum(quantidade * (proc.valorSa || 0))`.
- Definir `valorTotalEstimado` e formatar `valorTotalFormatado = fmtMoeda(valorTotalEstimado) + ' (SIGTAP Estimado)'`.
- Atualizar o elemento `#inputBpaValorTotal` no DOM durante `handleFileSelect`.

- [ ] **Step 4: Executar teste para validar aprovação (GREEN)**

```powershell
node --test scripts/tests/bpa-recepcao-integrada.test.cjs
```
Esperado: Todos os testes aprovados.

- [ ] **Step 5: Commit atômico da Task 2**

```powershell
git add code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js scripts/tests/bpa-recepcao-integrada.test.cjs
git commit -m "feat(bpa): calcular valor financeiro estimado R$ SIGTAP imediatamente no Raio-X"
```

---

### Task 3: Gating de Envio com Recepção Integrada e Alimentação do Espelho de Produção

**Files:**
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js:61-69, 3770-3830`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-engine.js:380-450`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-3d-renderer.js:370-395`
- Modify: `scripts/tests/bpa-recepcao-integrada.test.cjs`

**Interfaces:**
- Consumes: `penteFinoEngine.classificar5Regras(res)` e `bpaModule.auditApproval`.
- Produces: `canSubmitPendingUpload()` retorna `true` quando a auditoria foi realizada (mesmo com apontamentos), liberando o botão com rótulo e cor contextual.

- [ ] **Step 1: Escrever testes para o novo contrato de gating da Recepção Integrada**

Adicionar a `scripts/tests/bpa-recepcao-integrada.test.cjs`:

```javascript
test('canSubmitPendingUpload bloqueia ANTES da auditoria e libera APÓS a auditoria (mesmo com apontamentos)', () => {
    bpaModule.filePendingUpload = { fingerprint: 'sha_test_123', totalLinhas: 10 };

    // Caso 1: Sem auditoria executada -> Bloqueado
    bpaModule.auditApproval = null;
    assert.strictEqual(bpaModule.canSubmitPendingUpload(), false, 'Deve bloquear antes da auditoria');

    // Caso 2: Auditado com 100% de conformidade -> Liberado
    bpaModule.auditApproval = {
        fingerprint: 'sha_test_123',
        status: 'CONFORME',
        podeEnviarSemGlosa: true
    };
    assert.strictEqual(bpaModule.canSubmitPendingUpload(), true, 'Deve liberar após aprovação');

    // Caso 3: Auditado com apontamentos de risco -> Liberado (Recepção Integrada)
    bpaModule.auditApproval = {
        fingerprint: 'sha_test_123',
        status: 'COM_APONTAMENTOS',
        podeEnviarSemGlosa: false,
        totalApontamentos: 3
    };
    assert.strictEqual(bpaModule.canSubmitPendingUpload(), true, 'Deve liberar lote com apontamentos para recepção integrada');

    // Caso 4: Fingerprint divergente (arquivo trocado) -> Bloqueado
    bpaModule.auditApproval = {
        fingerprint: 'sha_outro_arquivo',
        status: 'CONFORME'
    };
    assert.strictEqual(bpaModule.canSubmitPendingUpload(), false, 'Deve bloquear se o arquivo foi alterado');
});
```

- [ ] **Step 2: Executar teste e validar a falha (RED)**

```powershell
node --test scripts/tests/bpa-recepcao-integrada.test.cjs
```
Esperado: Caso 3 falha porque `canSubmitPendingUpload()` atualmente exige `approval.podeEnviarSemGlosa === true`.

- [ ] **Step 3: Implementar o gating contextual e a persistência no Espelho de Produção**

1. Em `bpa-module.js`:
   - Atualizar `canSubmitPendingUpload()`:
     ```javascript
     canSubmitPendingUpload() {
         if (!this.filePendingUpload) return false;
         const approval = this.auditApproval;
         if (!approval) return false;
         if (this.filePendingUpload.fingerprint && approval.fingerprint && approval.fingerprint !== this.filePendingUpload.fingerprint) {
             return false;
         }
         return true;
     }
     ```
   - Atualizar o método `atualizarEstadoBotaoEnvio(auditResult)`:
     - Se `auditResult.podeEnviarSemGlosa`: botão verde `#10b981`, texto `Confirmar e Enviar Produção (Aprovada Sem Glosa)`.
     - Se `!auditResult.podeEnviarSemGlosa`: botão azul/âmbar `#0284c7`, texto `Confirmar Envio com Apontamentos de Auditoria`.
   - Em `handleFormSubmit()`:
     - Anexar metadados de auditoria (`status_auditoria`, `apontamentos`, `valor_conforme_sa`) ao registro salvo.
     - Garantir que a tabela do Espelho de Produção e a aba de Profissionais sejam atualizadas.
2. Em `pente-fino-engine.js` e `pente-fino-3d-renderer.js`:
   - Ao concluir a auditoria, invocar `bpaModule.setAuditResult(resultado)` e atualizar o botão de confirmação.

- [ ] **Step 4: Executar testes para validar aprovação (GREEN)**

```powershell
node --test scripts/tests/bpa-recepcao-integrada.test.cjs
```
Esperado: Todos os testes aprovados.

- [ ] **Step 5: Commit atômico da Task 3**

```powershell
git add code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-engine.js code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-3d-renderer.js scripts/tests/bpa-recepcao-integrada.test.cjs
git commit -m "feat(bpa): liberar envio com recepcao integrada e alimentar espelho de producao"
```

---

### Task 4: Verificação Ponta a Ponta, Regressão e Validação da Suíte Completa

**Files:**
- Modify: `scripts/tests/bpa-audit.test.cjs` (ajustar expectativas de gating se necessário)
- Modify: `scripts/tests/pente-fino-regras.test.cjs`

**Interfaces:**
- Suíte completa de testes automatizados do FPA ARGOS.

- [ ] **Step 1: Executar a suíte completa de testes de auditoria e BPA**

```powershell
node --test scripts/tests/bpa-recepcao-integrada.test.cjs scripts/tests/bpa-audit.test.cjs scripts/tests/pente-fino-regras.test.cjs scripts/tests/bpa-access.test.cjs scripts/tests/bpa-profissionais-ui.test.cjs
```
Esperado: 100% dos testes passando sem nenhuma quebra de regressão.

- [ ] **Step 2: Verificar `git diff --check` para garantir integridade do código**

```powershell
git diff --check
```
Esperado: Sem erros de formatação ou conflitos.

- [ ] **Step 3: Commit de alinhamento e finalização**

```powershell
git commit -am "test(bpa): validar integracao ponta a ponta da recepcao de producao bpa"
```
