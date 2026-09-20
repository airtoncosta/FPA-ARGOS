# Especificação Técnica e de Design: Pente Fino Anti-Glosa ARGOS 3D

**Data:** 20/09/2026  
**Status:** Aprovado para Planejamento  
**Escopo:** Módulo de Auditoria Prévia da Produção Ambulatorial (BPA), Interface 3D Holográfica do Pente Fino ARGOS e Migração de Terminologia  

---

## 1. Visão Geral e Propósito

O sistema de auditoria prévia do FPA ARGOS tem como finalidade impedir glosas faturadas no SIA/SUS antes da transmissão dos arquivos ambulatoriais (BPA-I e BPA-C) ao DATASUS.

Esta especificação formaliza:
1. A substituição global da terminologia **"Malha Fina"** por **"Pente Fino"** em todas as interfaces, botões, modais, tooltips e APIs do sistema.
2. A criação de uma experiência visual e interativa em **3D Holográfico do Pente Fino ARGOS**, com a gravação do nome **ARGOS** em relevo metálico iluminado no corpo do pente, dentes de escaneamento cibernético e feixe laser de varredura vertical de cima para baixo.
3. O enquadramento rígido do motor de auditoria em **5 Regras Fundamentais de Anti-Glosa**:
   - **Regra 1 (Lotação CNES):** O profissional está lotado e ativo no estabelecimento de saúde na competência do atendimento?
   - **Regra 2 (CBO x Procedimento):** Os procedimentos estão habilitados para a ocupação (CBO) do profissional conforme SIGTAP?
   - **Regra 3 (CID x Procedimento):** O CID informado está habilitado para o procedimento conforme SIGTAP?
   - **Regra 4 (Serviço/Classificação no CNES):** O serviço e classificação exigidos pelo procedimento estão cadastrados e ativos no CNES da unidade?
   - **Regra 5 (CNS do Profissional):** O Cartão Nacional de Saúde (CNS) do profissional é válido (tamanho, formato e dígito verificador módulo 11)?
4. Conclusão da auditoria com parecer visual inequívoco:
   - **Se Conforme (100% OK):** O Pente Fino finaliza a varredura com sinalização verde esmeralda luminosa e o parecer:
     > **"PODE ENVIAR A PRODUÇÃO SEM GLOSA"**  
     *(Liberando o envio imediato e destacando o botão de confirmação).*
   - **Se Não Conforme (Glosa):** Exibição do cartão de apontamento identificando quais das 5 regras foram violadas, com número da linha, CNES, CNS, código do procedimento e valor de risco estimado.

---

## 2. Experiência de Usuário (UX) & Arquitetura Visual 3D

### 2.1 Botão de Acionamento no Modal BPA
- **Localização:** Modal de Envio BPA (`#modalEnviarBpa`), coluna esquerda, abaixo do quadro de profissionais.
- **Rótulo:** `Auditar Agora com o Pente Fino Anti-Glosa`
- **Ícone:** `<i class="fas fa-shield-alt"></i>`
- **Estilo:** Gradiente Cyber Luxury Índigo/Obsidian (`linear-gradient(135deg, #1e1b4b, #312e81)`), borda de 1px em `#818cf8`, sombra volumétrica com brilho suave e efeito hover interativo.

### 2.2 Modal do Scanner 3D do Pente Fino (`#modalPenteFino3D`)
Ao clicar no botão, uma sobreposição com vidro escuro reflexivo (dark glassmorphism, `backdrop-filter: blur(16px)`) é renderizada:

1. **Cabeçalho:**
   - Badge: `AUDITORIA PENTE FINO ARGOS · SIA/SUS`
   - Identificação do Arquivo: Nome do lote, total de registros, competência e estabelecimento.
   - Botão de fechar sutil no canto superior direito.

2. **Área Central da Animação 3D:**
   - O **Pente Fino ARGOS 3D** é apresentado em perspectiva isométrica/tridimensional, exibindo a marca **ARGOS** gravada no cabo em cromo escovado e acrílico safira retroiluminado por LEDs ciano/índigo.
   - A animação realiza um ciclo de movimentação fluida de cima para baixo com micro-oscilações angulares (varredura mecânica realista de pente fino).
   - Feixe de laser de alta densidade projeta linhas de grade sobre os dados da produção conforme os dentes descem.
   - Trilha sonora sintetizada sutil gerada via Web Audio API (opcional, com botão de mutar) emitindo bipes ultrassônicos suaves a cada etapa validada.

3. **Checklist Dinâmico em 5 Etapas (HUD Lateral / Inferior):**
   Conforme o pente fino desce pela tela, os 5 marcadores mudam de estado de `Varrendo...` (azul pulsante) para `OK - Conforme` (verde-esmeralda `#10b981`) ou `GLOSA DETECTADA` (vermelho carmim `#ef4444`):
   1. `[✓] 1. Vínculo e Lotação no CNES da Unidade`
   2. `[✓] 2. Compatibilidade Procedimento x CBO (SIGTAP)`
   3. `[✓] 3. Compatibilidade Procedimento x CID (SIGTAP)`
   4. `[✓] 4. Habilitação de Serviço e Classificação no CNES`
   5. `[✓] 5. Validação Estrutural do Cartão SUS do Profissional`

4. **Painel de Conclusão:**
   - **Caso Sucesso Total:** O pente fino ancora com brilho estroboscópico suave, exibindo o selo:
     - `PRODUÇÃO APROVADA: PODE ENVIAR A PRODUÇÃO SEM GLOSA`
     - Botão em destaque: `Continuar para Envio de Produção` (fecha o modal do pente fino e posiciona o foco no botão de confirmação de envio).
   - **Caso Apontamento de Glosa:**
     - Exibição de cards expansíveis com cada linha que gerou glosa.
     - Detalhamento de: Regra Violada, Profissional (CNS), Procedimento (SIGTAP), Estabelecimento (CNES), Valor da Glosa Potencial e Ação Corretiva.
     - Botão `Exportar Diagnóstico Excel` e `Revisar Arquivo`.

---

## 3. Especificação das 5 Regras de Auditoria Anti-Glosa

O motor `PenteFinoEngine` (e `BpaAuditCore`) executa as validações com os seguintes critérios determinísticos:

### Regra 1: Lotação do Profissional no Estabelecimento de Saúde
* **Critério:** No registro de atendimento (BPA-I), o CNS do profissional informado deve possuir cadastro ativo na base CNES oficial da competência do atendimento para o CNES onde o serviço foi prestado.
* **Aprovação (OK):** O profissional está relacionado na equipe do estabelecimento, sem data de desativação anterior à competência, e com situação ativa.
* **Glosa:** Profissional não localizado no CNES da unidade de saúde na competência do atendimento.

### Regra 2: Habilitação do Procedimento para a Ocupação (CBO)
* **Critério:** Confronto do código de 10 dígitos do procedimento e do código de 6 dígitos do CBO do profissional contra a tabela oficial de relacionamentos do SIGTAP da competência.
* **Aprovação (OK):** O CBO do profissional consta na lista de ocupações habilitadas a registrar o procedimento no SIGTAP.
* **Glosa:** Procedimento não permitido para a ocupação/CBO informada (incompatibilidade SIGTAP x CBO).

### Regra 3: Habilitação do CID para o Procedimento
* **Critério:** No BPA-I, para procedimentos que possuem exigência de diagnóstico de acordo com o SIGTAP, o código CID-10 informado no registro é validado contra a tabela de CIDs compatíveis.
* **Aprovação (OK):** O CID informado consta expressamente no rol de CIDs autorizados para o procedimento.
* **Glosa:** CID informado não compatível com o procedimento no SIGTAP, ou ausência de CID em procedimento com exigência obrigatória.

### Regra 4: Serviços e Classificações Habilitados no CNES
* **Critério:** Quando o procedimento no SIGTAP exige serviço especializado e classificação técnica específica (ex: radiologia, nefrologia, atenção psicossocial), verifica se o CNES do estabelecimento possui o par `Serviço / Classificação` ativo e homologado na competência.
* **Aprovação (OK):** A unidade de saúde possui o serviço e a classificação requeridos cadastrados no CNES.
* **Glosa:** O estabelecimento não possui a habilitação do serviço/classificação no CNES para faturar o procedimento.

### Regra 5: Validação do Cartão Nacional de Saúde (CNS) do Profissional
* **Critério:** Validação algorítmica do número de 15 dígitos do Cartão SUS do profissional de saúde:
  - Início com prefixos oficiais válidos (1, 2, 7, 8 ou 9).
  - Ausência de sequências de dígitos repetidos fictícios (ex: 111111111111111).
  - Cálculo do dígito verificador pela regra de Módulo 11 oficial do Ministério da Saúde.
* **Aprovação (OK):** CNS válido estruturalmente e matematicamente.
* **Glosa:** CNS com quantidade incorreta de dígitos ou com dígito verificador inválido.

---

## 4. Estratégia de Migração Global de Nomenclatura

Para manter compatibilidade total com os testes já existentes e scripts externos, a arquitetura adota o padrão de espelhamento:

1. **Objeto JavaScript Global:**
   - Criação de `window.PenteFinoEngine` como módulo canônico.
   - Criação de proxy/alias `window.MalhaFinaEngine = window.PenteFinoEngine` para que chamadas legadas continuem 100% funcionais sem quebrar nenhuma automação.
2. **HTML:**
   - Botão do Header (`#btnMalhaFinaTop`): Texto alterado de `Malha Fina` para `Pente Fino`, tooltip alterado para `Auditoria de Pente Fino Anti-Glosa DATASUS`.
   - Botão do Modal BPA: `Auditar Agora com o Pente Fino Anti-Glosa`.
3. **CSS:**
   - Adição das novas classes `pente-fino-*` e manutenção de compatibilidade das classes `mf-*` existentes.
4. **Relatórios e Notificações:**
   - Atualização de menções nos textos de feedback e diagnósticos gerados.

---

## 5. Plano de Verificação e Testes

1. **Testes Unitários de Regras (Node.js):**
   - Execução da suite `bpa-audit.test.cjs` para confirmar que todas as regras de validação determinística permanecem intactas (25 testes passando).
   - Criação de suite de testes específica para o motor das 5 regras do Pente Fino (`scripts/tests/pente-fino-regras.test.cjs`).
2. **Testes de Regressão de Acesso e Interface:**
   - Execução de `bpa-access.test.cjs` (23 testes passando).
3. **Verificação Visual e Interativa no Navegador:**
   - Abertura do modal de Envio BPA com arquivo de teste real.
   - Clique no botão `Auditar Agora com o Pente Fino Anti-Glosa`.
   - Validação da renderização do Pente Fino 3D ARGOS, movimento vertical, acendimento dos 5 itens e emissão da mensagem `"Pode enviar a produção sem glosa"`.
