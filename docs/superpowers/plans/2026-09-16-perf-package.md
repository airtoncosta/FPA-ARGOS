# Pacote de Alta Performance — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o pacote das 3 melhorias de performance de maior impacto no FPA-ARGOS: Compressão HTTP Gzip/Deflate nativa no `server.js`, Debounce nos inputs de busca e Skeleton Screens de carregamento com shimmer suave na interface.

**Architecture:** Módulo `lib/compression.js` com interceptador de compressão transparente para `server.js`; módulo `lib/debounce.js` isomórfico aplicado aos inputs de busca; folhas de estilo e utilitários de Skeleton Shimmer em `css/style.css` e `js/perf-utils.js`.

**Tech Stack:** Node.js (v24 nativo, `node:test`, `node:assert/strict`, `zlib`), Vanilla JS, CSS3 Moderno (Taste-skill). Zero dependências npm adicionais.

**Spec:** [docs/superpowers/specs/2026-09-16-perf-package-design.md](file:///c:/Users/Controle/.gemini/antigravity-ide/scratch/FPA-ARGOS/docs/superpowers/specs/2026-09-16-perf-package-design.md)

---

## File Structure

```
FPA-ARGOS/
├── lib/
│   ├── compression.js             # [NEW] Módulo de compressão Gzip/Deflate nativa
│   └── debounce.js                # [NEW] Utilitário de debounce isomórfico
├── server.js                      # [MODIFY] Integração de compressão HTTP para JSON e arquivos estáticos
├── code_sandbox_light_git_fe61910d_1781185357/
│   ├── css/
│   │   └── style.css              # [MODIFY] Estilos e animação shimmer para Skeleton Screens
│   ├── js/
│   │   ├── perf-utils.js          # [NEW] Utilitários de debounce e gerador de skeletons no frontend
│   │   ├── app.js                 # [MODIFY] Aplicação de debounce nos inputs de busca de unidades
│   │   └── bpa-module.js          # [MODIFY] Aplicação de debounce na busca e skeletons no carregamento
│   └── index.html                 # [MODIFY] Inclusão de perf-utils.js
└── test/
    ├── compression.test.js        # [NEW] Testes unitários do compressor zlib
    ├── debounce.test.js           # [NEW] Testes unitários do debounce
    └── server-compression.test.js # [NEW] Testes de integração HTTP para respostas comprimidas
```

---

### Task 1: Módulo Core de Compressão HTTP (`lib/compression.js`) & `server.js`

**Files:**
- Create: `lib/compression.js`
- Modify: `server.js`
- Test: `test/compression.test.js`, `test/server-compression.test.js`

- [ ] **Step 1: Escrever teste unitário `test/compression.test.js` (RED)**
- [ ] **Step 2: Executar teste para confirmar falha esperada**
- [ ] **Step 3: Implementar `lib/compression.js` (GREEN)**
- [ ] **Step 4: Executar teste unitário e validar aprovação**
- [ ] **Step 5: Escrever teste de integração HTTP `test/server-compression.test.js` (RED)**
- [ ] **Step 6: Integrar compressão no `server.js` para JSONs de API e arquivos estáticos (GREEN)**
- [ ] **Step 7: Validar que `server-compression.test.js` passa 100%**

---

### Task 2: Utilitário de Debounce nos Inputs de Busca

**Files:**
- Create: `lib/debounce.js`
- Create: `code_sandbox_light_git_fe61910d_1781185357/js/perf-utils.js`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/index.html`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/app.js`
- Test: `test/debounce.test.js`

- [ ] **Step 1: Escrever teste unitário `test/debounce.test.js` (RED)**
- [ ] **Step 2: Executar teste para confirmar falha esperada**
- [ ] **Step 3: Implementar `lib/debounce.js` e `perf-utils.js` (GREEN)**
- [ ] **Step 4: Integrar nos listeners de busca (`#searchBpaInput`, `#searchUnidade`)**
- [ ] **Step 5: Executar teste e validar 100% PASS**

---

### Task 3: Sistema de Skeleton Screens Shimmer no Frontend

**Files:**
- Modify: `code_sandbox_light_git_fe61910d_1781185357/css/style.css`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/perf-utils.js`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js`
- Test: `test/skeletons.test.js`

- [ ] **Step 1: Adicionar estilos de animação `@keyframes argos-shimmer` e componentes `.skeleton-*` no CSS**
- [ ] **Step 2: Implementar renderizadores de cards e tabelas skeleton no `perf-utils.js`**
- [ ] **Step 3: Escrever teste automatizado `test/skeletons.test.js` validando integridade de templates e CSS**
- [ ] **Step 4: Integrar estado de carregamento com skeleton no `bpa-module.js`**

---

### Task 4: Suíte Geral de Regressão e Homologação

- [ ] **Step 1: Executar todos os testes automatizados da aplicação (`node --test test/*.test.js`)**
- [ ] **Step 2: Atualizar `walkthrough.md` com métricas de redução de payload e responsividade**
