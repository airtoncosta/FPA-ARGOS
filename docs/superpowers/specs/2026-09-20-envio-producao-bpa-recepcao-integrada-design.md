# Especificação Técnica de Design: Envio de Produção BPA com Recepção e Auditoria Integrada

**Data:** 20/09/2026  
**Status:** Aprovado em Brainstorming  
**Escopo:** Módulo BPA (`BpaModule`), Reconhecimento de Vínculos CNES com Aliases, Visualização de CNS Desmascarado, Detalhamento de Procedimentos por Profissional, Precificação Estimada SIGTAP e Gating de Envio com Recepção Integrada no Espelho de Produção  

---

## 1. Visão Geral e Justificativa

Na rotina de faturamento e auditoria ambulatorial do SUS (SIA/SUS - BPA-I e BPA-C), o faturista e o auditor municipal realizam o confronto dos arquivos de produção enviados pelos prestadores de serviços de saúde.

O fluxo anterior apresentava três atritos críticos:
1. **Falso Positivo de Vínculo:** Arquivos como `PATomo08.AGO` do Hospital Maria Socorro Brandão vinculados ao CNES histórico `2387412` não encontravam os médicos na base oficial cadastrada sob o CNES `2458055`, rotulando os médicos radiologistas (Dr. José Amorim Pereira Filho e Dra. Amanda Almeida Miranda) em vermelho como *(Profissional sem vínculo localizado nesta unidade)* e ocultando seus nomes.
2. **Máscara Indevida de CNS:** O sistema ofuscava os dígitos centrais do Cartão SUS (`700*********353`), impedindo o operador de conferir os 15 dígitos reais para cotejamento com o CNES/CADSUS.
3. **Bloqueio Rígido e Paralisante do Envio:** O botão *Confirmar e Enviar Produção* permanecia travado (`disabled`), exigindo 100% de conformidade sem permitir a recepção com apontamentos para conciliação posterior.

Esta especificação define a arquitetura da **Recepção com Auditoria Integrada**, garantindo:
- Reconhecimento automático de unidades por CNES oficial e aliases;
- Identificação nominal dos médicos com CNS completo (15 dígitos visíveis) e exibição detalhada de cada procedimento realizado e o volume total;
- Cálculo e exibição imediata do valor financeiro estimado (R$ SIGTAP) do lote;
- Liberação do botão de envio após a execução da auditoria prévia do Pente Fino, permitindo a gravação com o carimbo do parecer (`CONFORME` ou `COM_APONTAMENTOS`) e a alimentação transparente do Espelho de Produção.

---

## 2. Requisitos Funcionais e Interface

### 2.1 Raio-X Visual do Arquivo e Profissionais
1. **Resolução de Unidade Multi-CNES (com Aliases):**
   - Ao inspecionar o arquivo (`PATomo08.AGO`), o sistema deve verificar tanto o CNES principal quanto o array `aliases` dos estabelecimentos da base oficial.
   - Quando o arquivo trouxer o CNES `2387412` ou a sigla `TOMO`/`HMSO`, o estabelecimento é identificado canonicamente como `HOSPITAL MARIA SOCORRO BRANDAO` (CNES `2458055`).
2. **Identificação e Vínculo dos Profissionais:**
   - Para o arquivo de tomografia de agosto/2026:
     - `CNS 700505151875353`: Reconhecido como **Dr. José Amorim Pereira Filho** — CBO 225320 (Médico Radiologista) — *Vínculo Confirmado no CNES* (Selo Verde).
     - `CNS 700001311387700`: Reconhecida como **Dra. Amanda Almeida Miranda** — CBO 225320 (Médica Radiologista) — *Vínculo Confirmado no CNES* (Selo Verde).
3. **Exibição Desmascarada do Cartão SUS (CNS):**
   - Na listagem de profissionais do arquivo, os **15 dígitos completos do CNS devem ser exibidos sem máscara de asteriscos** (ex: `CNS 700505151875353`), formatados em fonte monoespaçada legível com botão/ação rápida de cópia.
4. **Detalhamento da Produção por Profissional:**
   - Exibição do quantitativo total produzido por cada profissional (ex: `345 atendimentos`).
   - Relação discriminada de cada procedimento realizado pelo profissional com o código de 10 dígitos do SIGTAP e a quantidade individualizada (ex: `0206030037: 69`, `0206010079: 67`, `0206030010: 60`, etc.).
5. **Precificação Estimada Imediata em R$ (SIGTAP):**
   - A leitura do arquivo calcula imediatamente o valor total bruto estimado com base nos valores SA da tabela SIGTAP carregada da competência.
   - Substitui o texto *"Disponível após auditoria..."* pelo valor formatado em moeda brasileira (ex: `R$ 66.941,28 (SIGTAP Estimado)`).

### 2.2 Auditoria Holográfica 3D (Pente Fino)
1. **Acionamento:**
   - O botão `Auditar Agora com o Pente Fino Anti-Glosa` abre o scanner 3D e executa a varredura mecânica vertical das 5 regras determinísticas.
2. **Parecer Estruturado:**
   - Retorna o resultado com a contagem de registros conformes e apontamentos de inconformidade por regra.
   - Emite o parecer oficial:
     - Se zero apontamentos: `statusAuditado = 'CONFORME'`, mensagem `Produção Aprovada Sem Glosa`.
     - Se houver apontamentos: `statusAuditado = 'COM_APONTAMENTOS'`, mensagem `Produção com Apontamentos de Risco` e listagem analítica para conciliação.

### 2.3 Gating de Envio e Recepção Integrada
1. **Estado do Botão Antes da Auditoria:**
   - `#btnConfirmarUploadBpa` permanece desabilitado com o rótulo:
     `<i class="fas fa-shield-alt"></i> Execute a Auditoria do Pente Fino para Liberar o Envio`
   - O botão orienta explicitamente o faturista a rodar o Pente Fino primeiro, garantindo rastreabilidade obrigatória de auditoria prévia.
2. **Estado do Botão Após a Auditoria:**
   - `#btnConfirmarUploadBpa` é **habilitado imediatamente**:
     - *Se 100% Conforme:* Estilo verde esmeralda com o texto `<i class="fas fa-check-circle"></i> Confirmar e Enviar Produção (Aprovada Sem Glosa)`.
     - *Se com Apontamentos:* Estilo azul corporativo com o texto `<i class="fas fa-paper-plane"></i> Confirmar Envio com Apontamentos de Auditoria`.
3. **Persistência no Espelho de Produção:**
   - Ao salvar a produção, o registro gravado conterá:
     - `status_auditoria`: `'CONFORME'` ou `'COM_APONTAMENTOS'`
     - `audit_fingerprint`: Hash SHA-256 do arquivo auditado
     - `audit_timestamp`: Data e hora da auditoria
     - `total_atendimentos`, `total_conformes`, `total_risco_glosa`
     - `valor_total_sa`, `valor_conforme_sa`
   - O lote é inserido no Espelho de Produção da competência correspondente (`08/2026`).
   - A tabela da aba **Produção por Profissional** é atualizada com a produção individualizada de cada médico.
   - Se o checkbox de e-mail estiver marcado, abre a rotina de despacho para `auditoriabacabal@gmail.com` com o arquivo anexo e o parecer técnico.
4. **Troca ou Fechamento do Arquivo:**
   - Se o operador selecionar outro arquivo ou fechar o modal, a auditoria pendente é descartada e o botão retorna ao estado de aguardando nova auditoria.

---

## 3. Arquitetura Técnica e Módulos Afetados

### 3.1 `code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js`
- **`loadCnesBase(competencia)`:** Garantir o carregamento da base CNES correspondente à competência da produção (`cnes_210120_202608.json` para 08/2026 ou cache em memória).
- **`lookupProfissional(cns, cnes)`:**
  - Atualizar a busca de unidade para checar `String(est.cnes) === cleanCnes || (Array.isArray(est.aliases) && est.aliases.map(String).includes(cleanCnes))`.
  - Definir `vinculadoUnidade = true` quando a unidade for compatível com o CNES ou seus aliases.
- **`formatProfissionaisAmostra(profissionaisDetalhados)`:**
  - Remover máscara de asteriscos para o preview do operador, exibindo o CNS com todos os 15 dígitos.
  - Renderizar os badges dos procedimentos individuais realizados pelo médico com código e quantidade.
- **`parseBpaFile(file, textContent)`:**
  - Precificar os atendimentos utilizando os valores SA disponíveis do catálogo SIGTAP da competência, gerando `valorTotalFormatado` e `valorTotalEstimado` imediatamente.
- **`canSubmitPendingUpload()`:**
  - Retornar `true` se `this.auditApproval` estiver presente e com o mesmo `fingerprint` do arquivo atual, sem bloquear envios com apontamentos.
- **`handleFormSubmit()`:**
  - Persistir os metadados de auditoria e alimentar o Espelho de Produção.

### 3.2 `code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-engine.js` e `pente-fino-3d-renderer.js`
- Notificar `BpaModule` ao final do escaneamento através de callback/evento `onAuditCompleted(resultado)`.
- Atualizar a renderização do botão `#btnConfirmarUploadBpa` conforme o parecer final.

---

## 4. Plano de Verificação e Testes (TDD)

1. **Testes de Unidade e Integração (Node.js `scripts/tests/`):**
   - Atualizar a suite `scripts/tests/pente-fino-regras.test.cjs` e `scripts/tests/bpa-audit.test.cjs`.
   - Validar que o Hospital Maria Socorro Brandão com alias `2387412` reconhece os médicos Dr. José Amorim e Dra. Amanda como vinculados na competência 08/2026.
   - Validar que `profissionaisAmostra` contém o CNS de 15 dígitos sem asteriscos e a listagem de procedimentos.
   - Validar que `canSubmitPendingUpload` é verdadeiro após a auditoria tanto para lote aprovado quanto para lote com apontamentos, e falso antes da auditoria.
   - Executar a suite completa com `node --test scripts/tests/*.test.cjs`.
2. **Verificação no Navegador:**
   - Carregar o arquivo `PATomo08.AGO` no modal de envio BPA.
   - Confirmar a exibição dos nomes dos médicos, CNS com 15 dígitos e procedimentos.
   - Clicar em "Auditar Agora com o Pente Fino Anti-Glosa" e validar a animação 3D.
   - Verificar a liberação do botão de confirmação e a gravação com sucesso no Espelho de Produção.
