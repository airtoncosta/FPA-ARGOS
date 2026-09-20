# Pente Fino Anti-Glosa ARGOS 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o motor de auditoria em 5 regras do Pente Fino Anti-Glosa com animação 3D do pente com o nome ARGOS escaneando de cima para baixo, renomear globalmente "Malha Fina" para "Pente Fino" e exibir parecer "Pode enviar a produção sem glosa".

**Architecture:** Módulo canônico `window.PenteFinoEngine` integrado a um renderizador 3D holográfico (`PenteFino3DRenderer`) com visualização de varredura vertical, dentes ópticos e checkpoints em tempo real para as 5 regras anti-glosa (Lotação CNES, CBO x Procedimento, CID x Procedimento, Serviço/Classificação CNES e Validação Cartão SUS), mantendo `window.MalhaFinaEngine` como alias para 100% de retrocompatibilidade.

**Tech Stack:** JavaScript (ES6+), Three.js/WebGL/Canvas 3D + CSS 3D Transforms, Web Audio API, Node.js para testes automatizados.

**Spec:** [`docs/superpowers/specs/2026-09-20-pente-fino-argos-3d-design.md`](file:///d:/FPA%20ARGOS/docs/superpowers/specs/2026-09-20-pente-fino-argos-3d-design.md)

## Global Constraints
- Substituição global da terminologia "Malha Fina" por "Pente Fino" em botões, textos e modais.
- O botão no modal de envio BPA terá o texto: `Auditar Agora com o Pente Fino Anti-Glosa`.
- O Pente Fino 3D deve conter o nome `ARGOS` gravado em relevo metálico luminoso e se mover de cima para baixo com varredura laser.
- As 5 regras determinísticas devem ser avaliadas com clareza: Lotação no CNES, CBO x Procedimento, CID x Procedimento, Serviços/Classificações no CNES e Cartão SUS (CNS) válido com módulo 11.
- Se 100% aprovado, sinalizar com selo verde `Pode enviar a produção sem glosa`.
- Não quebrar nenhum teste automatizado existente em `scripts/tests/`.

---

### Task 1: Motor das 5 Regras do Pente Fino Anti-Glosa e Testes TDD

**Files:**
- Create: `scripts/tests/pente-fino-regras.test.cjs`
- Create: `code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-engine.js`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/malha-fina-engine.js`

**Interfaces:**
- Consumes: `window.BpaAuditCore`, `window.BpaModule`, `window.SigtapAuditApi`
- Produces: `window.PenteFinoEngine.executar(dados)`, `window.PenteFinoEngine.auditar5Regras(parsed, bases)`, `window.MalhaFinaEngine` (alias)

- [ ] **Step 1: Criar o teste automatizado para as 5 regras determinísticas**
Criar `scripts/tests/pente-fino-regras.test.cjs` validando individualmente cada uma das 5 regras:
1. Profissional lotado na unidade CNES (Passa se vinculado, Glosa se ausente ou desligado).
2. Procedimentos habilitados ao CBO (Passa se SIGTAP permite, Glosa se incompatível).
3. CID habilitado ao procedimento (Passa se SIGTAP autoriza, Glosa se não autorizado).
4. Serviços e classificação habilitados no CNES (Passa se unidade tem serviço, Glosa se não tem).
5. Cartão SUS (CNS) do profissional correto (Passa se dígito módulo 11 válido, Glosa se inválido).
6. Verificação do status final "PODE_ENVIAR_SEM_GLOSA" quando todas as 5 regras estão conformes.

- [ ] **Step 2: Executar o teste para verificar falha (Red)**
Run: `node scripts/tests/pente-fino-regras.test.cjs`
Expected: FAIL (módulo ainda não exportado ou funções das 5 regras não implementadas).

- [ ] **Step 3: Implementar `pente-fino-engine.js` com a consolidação das 5 regras**
Criar `code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-engine.js` estruturando:
- `auditar5Regras(parsed, bases)`: extrai o veredito específico das 5 regras a partir de `BpaAuditCore`.
- Retorno padronizado:
  - `regra1_lotacao_cnes`: { ok: boolean, total: number, glosas: array, label: "Lotação do Profissional no CNES" }
  - `regra2_cbo_procedimento`: { ok: boolean, total: number, glosas: array, label: "CBO Habilitado ao Procedimento" }
  - `regra3_cid_procedimento`: { ok: boolean, total: number, glosas: array, label: "CID Habilitado ao Procedimento" }
  - `regra4_servico_classificacao`: { ok: boolean, total: number, glosas: array, label: "Serviço e Classificação no CNES" }
  - `regra5_cns_profissional`: { ok: boolean, total: number, glosas: array, label: "Cartão SUS (CNS) do Profissional" }
  - `podeEnviarSemGlosa`: boolean (true se as 5 regras estiverem 100% OK)
- Expor `window.PenteFinoEngine` e espelhar `window.MalhaFinaEngine = window.PenteFinoEngine`.

- [ ] **Step 4: Executar os testes para verificar aprovação (Green)**
Run: `node scripts/tests/pente-fino-regras.test.cjs`
Run: `node scripts/tests/bpa-audit.test.cjs`
Expected: PASS (todos os testes passando).

- [ ] **Step 5: Commit do motor e testes**
```bash
git add scripts/tests/pente-fino-regras.test.cjs code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-engine.js code_sandbox_light_git_fe61910d_1781185357/js/malha-fina-engine.js
git commit -m "feat(audit): implement 5-rule Pente Fino Anti-Glosa engine and test suite"
```

---

### Task 2: Componente Visual 3D Holográfico do Pente Fino ARGOS

**Files:**
- Create: `code_sandbox_light_git_fe61910d_1781185357/css/pente-fino-3d.css`
- Create: `code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-3d-renderer.js`

**Interfaces:**
- Consumes: Asset 3D `img/pente-fino-argos-3d.jpg`, DOM Container `#modalPenteFino3D`
- Produces: `window.PenteFino3DRenderer.abrirScanner(dadosArquivo, onComplete)`

- [ ] **Step 1: Criar estilos holográficos e animação 3D em `pente-fino-3d.css`**
- Overlay modal escuro com glassmorphism de alta densidade (`rgba(5, 10, 24, 0.88)` e blur de 16px).
- Estrutura de visualização 3D:
  - Quadro do pente fino com iluminação metálica, chanfro e logo "ARGOS" em relevo luminoso ciano.
  - Feixe laser de escaneamento horizontal com emissão de luz gradiente azul-índigo e partículas.
  - Animação de descida e varredura do pente fino (`scan-vertical` com micro-inclinação `rotateZ`).
  - Painel HUD das 5 regras com marcadores animados:
    - Estado de varredura: indicador pulsante ciano.
    - Estado de aprovação: badge neon verde `#10b981` com ícone de check.
    - Estado de glosa: badge carmim `#ef4444` com ícone de alerta.
  - Selo final de aprovação holográfico: `PODE ENVIAR A PRODUÇÃO SEM GLOSA` com animação de pulso e brilho perimétrico.

- [ ] **Step 2: Implementar o renderizador e controlador interativo em `pente-fino-3d-renderer.js`**
- Montagem dinâmica do modal `#modalPenteFino3D` caso ainda não exista no DOM.
- Sequência de animação orquestrada:
  1. Início do scanner: Pente Fino ARGOS aparece no topo da tela com brilho inicial.
  2. Descida gradual (3 a 4 segundos de varredura controlada):
     - Passagem pela Regra 1 (Lotação CNES) -> Checkpoint 1 ativa.
     - Passagem pela Regra 2 (CBO x Procedimento) -> Checkpoint 2 ativa.
     - Passagem pela Regra 3 (CID x Procedimento) -> Checkpoint 3 ativa.
     - Passagem pela Regra 4 (Serviço e Classificação) -> Checkpoint 4 ativa.
     - Passagem pela Regra 5 (Cartão SUS do Profissional) -> Checkpoint 5 ativa.
  3. Chegada à base e carimbo de resultado:
     - Se `podeEnviarSemGlosa === true`: Efeito sonoro sutil de confirmação, iluminação verde no pente, exibição do selo **"PODE ENVIAR A PRODUÇÃO SEM GLOSA"** e botão de ação `Avançar para Envio`.
     - Se houver glosa: Iluminação vermelha/alerta, parada do pente no ponto de não-conformidade e expansão do relatório detalhado de glosas.

- [ ] **Step 3: Testar visualmente a renderização do modal e animação**
Verificar no navegador a fluidez da animação em 60fps, responsividade em mobile e desktop, e transições de estado.

- [ ] **Step 4: Commit do componente 3D**
```bash
git add code_sandbox_light_git_fe61910d_1781185357/css/pente-fino-3d.css code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-3d-renderer.js
git commit -m "feat(ui): add ARGOS 3D Pente Fino holographic scanner component and styles"
```

---

### Task 3: Migração Global de Terminologia ("Malha Fina" -> "Pente Fino") na Interface

**Files:**
- Modify: `code_sandbox_light_git_fe61910d_1781185357/index.html`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/cnes-module.js`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/js/app.js`

**Interfaces:**
- Atualiza elementos HTML de exibição e manipuladores de clique:
  - Botão `#btnMalhaFinaTop` -> texto `Pente Fino`, tooltip `Auditoria de Pente Fino Anti-Glosa DATASUS`.
  - Botão no modal BPA -> `Auditar Agora com o Pente Fino Anti-Glosa` chamando `window.PenteFinoEngine.executarComAnimacao3D()`.

- [ ] **Step 1: Atualizar `index.html` com o novo botão, scripts e estilos**
- Importar `css/pente-fino-3d.css` no `<head>`.
- Importar `js/pente-fino-engine.js` e `js/pente-fino-3d-renderer.js` antes de `app.js`.
- No botão do cabeçalho `#btnMalhaFinaTop`:
  - Mudar `<span>Malha Fina</span>` para `<span>Pente Fino</span>`.
  - Mudar `title="Auditoria de Malha Fina Anti-Glosa DATASUS"` para `title="Auditoria de Pente Fino Anti-Glosa DATASUS"`.
- No botão de ação do modal BPA (linha ~2272):
  - Atualizar texto: `<i class="fas fa-shield-alt" style="color: #a5b4fc;"></i> Auditar Agora com o Pente Fino Anti-Glosa`.
  - Atualizar chamada `onclick="window.PenteFinoEngine.executarComAnimacao3D(BpaModule.filePendingUpload)"`.

- [ ] **Step 2: Atualizar `bpa-module.js`, `cnes-module.js` e `app.js`**
- Substituir ocorrências textuais de "Malha Fina" por "Pente Fino" nas mensagens de interface, mantendo os fluxos existentes.
- Integrar a conclusão com aprovação ao botão `Confirmar e Enviar Produção`: ao receber "PODE ENVIAR A PRODUÇÃO SEM GLOSA", habilitar e destacar o botão com selo verde.

- [ ] **Step 3: Commit das alterações de interface e textos**
```bash
git add code_sandbox_light_git_fe61910d_1781185357/index.html code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js code_sandbox_light_git_fe61910d_1781185357/js/cnes-module.js code_sandbox_light_git_fe61910d_1781185357/js/app.js
git commit -m "refactor(ui): update terminology from Malha Fina to Pente Fino across the application"
```

---

### Task 4: Integração de Ponta a Ponta, Verificação de Não-Regressão e Validação

**Files:**
- Test: `scripts/tests/pente-fino-regras.test.cjs`
- Test: `scripts/tests/bpa-audit.test.cjs`
- Test: `scripts/tests/bpa-access.test.cjs`
- Test: `scripts/tests/bpa-profissionais-ui.test.cjs`

- [ ] **Step 1: Executar suite completa de testes automatizados**
Run: `node scripts/tests/pente-fino-regras.test.cjs`
Run: `node scripts/tests/bpa-audit.test.cjs`
Run: `node scripts/tests/bpa-access.test.cjs`
Run: `node scripts/tests/bpa-profissionais-ui.test.cjs`
Expected: Todos os testes com 100% de sucesso (PASS).

- [ ] **Step 2: Teste de ponta a ponta com simulação de upload BPA**
Executar script de verificação simulando arquivo BPA real:
- Verificar abertura do modal Pente Fino ARGOS 3D.
- Conferir animação mecânica de cima para baixo com o logo ARGOS.
- Checar transição dos 5 passos (todos OK).
- Confirmar exibição de `Pode enviar a produção sem glosa`.

- [ ] **Step 3: Commit final e fechamento de plano**
```bash
git add -A
git commit -m "feat(pente-fino): complete 3D ARGOS Pente Fino anti-glosa audit system"
```
