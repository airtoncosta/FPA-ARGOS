# Observabilidade & Trilha de Auditoria — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar sistema de observabilidade corporativa no FPA-ARGOS com logs estruturados em JSON, correlation ID (`x-request-id`) propagado para background jobs, e trilha de auditoria formal para operações críticas com mascaramento automático de credenciais sensíveis.

**Architecture:** Módulo `lib/logger.js` gerando logs padronizados em JSON com timestamp, correlationId e medição de latência; módulo `lib/audit-logger.js` com buffer não-bloqueante e mascarador de credenciais; integração no `server.js` e em `JobQueue`.

**Tech Stack:** Node.js (v24 nativo, `node:test`, `node:assert/strict`, `fs`, `path`, `crypto`). Zero dependências npm adicionais.

**Spec:** [docs/superpowers/specs/2026-09-16-observability-design.md](file:///c:/Users/Controle/.gemini/antigravity-ide/scratch/FPA-ARGOS/docs/superpowers/specs/2026-09-16-observability-design.md)

---

## File Structure

```
FPA-ARGOS/
├── lib/
│   ├── logger.js                  # [NEW] Logger estruturado JSON com correlation IDs
│   └── audit-logger.js            # [NEW] Gravador de trilha de auditoria e sanitizador
├── server.js                      # [MODIFY] Injeção de x-request-id e logging de requisições HTTP
└── test/
    ├── logger.test.js             # [NEW] Testes unitários do logger estruturado
    ├── audit-logger.test.js       # [NEW] Testes unitários da trilha de auditoria e mascaramento
    └── server-observability.test.js # [NEW] Testes de integração HTTP para x-request-id
```

---

### Task 1: Módulo Core `lib/logger.js`

**Files:**
- Create: `lib/logger.js`
- Test: `test/logger.test.js`

- [ ] **Step 1: Escrever teste unitário automatizado (RED)**
- [ ] **Step 2: Executar teste para confirmar falha esperada**
- [ ] **Step 3: Implementar `lib/logger.js` (GREEN)**
- [ ] **Step 4: Executar teste e validar 100% PASS**

---

### Task 2: Módulo de Auditoria `lib/audit-logger.js`

**Files:**
- Create: `lib/audit-logger.js`
- Test: `test/audit-logger.test.js`

- [ ] **Step 1: Escrever teste unitário automatizado (RED)**
  - Validação de mascaramento de senhas (`smtp_pass`, `resend_api_key`, `authorization`).
  - Gravação de evento de auditoria em arquivo / buffer.
- [ ] **Step 2: Executar teste para confirmar falha esperada**
- [ ] **Step 3: Implementar `lib/audit-logger.js` (GREEN)**
- [ ] **Step 4: Executar teste e validar 100% PASS**

---

### Task 3: Integração no Servidor Node.js (`server.js`) & `JobQueue`

**Files:**
- Modify: `server.js`
- Test: `test/server-observability.test.js`

- [ ] **Step 1: Escrever teste de integração HTTP (RED)**
  - Validação do retorno de `x-request-id` no header.
  - Propagação de correlationId nos jobs enfileirados.
- [ ] **Step 2: Executar teste para confirmar falha esperada**
- [ ] **Step 3: Integrar middleware de correlation ID e audit logging no `server.js` (GREEN)**
- [ ] **Step 4: Executar teste de integração e validar 100% PASS**

---

### Task 4: Suíte Geral de Regressão e Validação Final

- [ ] **Step 1: Executar todos os testes automatizados da aplicação**
  `& 'C:\Program Files\nodejs\node.exe' --test test/*.test.js`
- [ ] **Step 2: Atualizar `walkthrough.md` com os 4 sub-projetos concluídos**
