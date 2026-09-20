# Pente Fino ARGOS — Auditoria de Produção Design

**Data:** 20/09/2026  
**Status:** aguardando revisão do usuário  
**Substitui, para o motor de produção, as regras de dados da especificação `2026-09-20-pente-fino-argos-3d-design.md`.**

## Objetivo

Fazer o Pente Fino bloquear o envio de um BPA quando uma das cinco regras de produção falhar ou não puder ser comprovada pela fonte oficial da competência. O parecer `PODE ENVIAR A PRODUÇÃO SEM GLOSA` só pode aparecer quando todas as regras aplicáveis estiverem confirmadas.

## Fonte de verdade e competência

O motor nunca aprova com catálogo local inferido, alias hardcoded ou vínculo global por CNS.

| Domínio | Fonte | Uso no motor |
|---|---|---|
| Procedimento, CBO, CID e pares serviço/classificação | adaptador do menu SIGTAP (`SigtapAuditApi`) | Carregar as relações oficiais da mesma competência do registro BPA. A tabela visual estática só pode fornecer nome/valor, nunca autorizar uma regra. |
| Unidade, profissional e CNS | mesma API/snapshot publicado usada pelo menu **CNES & Vínculos** | Localizar o CNS no CNES exato e na competência exata. Aliases somente quando vierem versionados no snapshot daquela competência. |

Toda fonte deve informar a competência solicitada e a cobertura da relação consultada. Fonte ausente, incompleta ou de competência distinta produz `NAO_VERIFICADO`; não produz aprovação nem glosa definitiva.

## Estados e parecer final

Cada regra retorna um destes estados:

- `CONFORME`: a fonte oficial comprovou a condição.
- `NAO_CONFORME`: a fonte oficial completa comprovou violação.
- `NAO_VERIFICADO`: faltam dados oficiais para concluir.
- `NAO_APLICAVEL`: a própria relação oficial prova que a regra não se aplica.

O lote somente será liberado se todas as regras aplicáveis forem `CONFORME` ou `NAO_APLICAVEL` e não existir erro estrutural, duplicidade, alerta ou pendência de dados. `NAO_VERIFICADO` resulta em `INCONCLUSIVO / ENVIO BLOQUEADO`, com motivo rastreável; não deve ser classificado como glosa definitiva.

## Regras acordadas

### 1. Lotação do profissional no CNES

Aplicável aos registros BPA-I. O CNS de 15 dígitos do profissional deve existir no estabelecimento CNES do registro e na mesma competência.

- `CONFORME`: o CNS está vinculado à unidade e competência consultadas.
- `NAO_CONFORME`: a base CNES completa daquela competência não contém o CNS na unidade. CNS encontrado apenas em outra unidade não confirma o vínculo.
- `NAO_VERIFICADO`: a base/unidade/vínculos da competência não está disponível ou sua cobertura é parcial.

**Decisão de escopo do usuário:** esta auditoria de produção não avalia situação, data de desligamento ou desativação do profissional. Esses campos não são pré-requisitos da Regra 1 neste fluxo.

### 2. CBO habilitado ao procedimento

O CBO informado precisa ter seis dígitos e constar expressamente na relação SIGTAP completa do procedimento e competência.

- `CONFORME`: CBO numérico de seis dígitos presente na relação oficial.
- `NAO_CONFORME`: CBO malformado ou ausente da relação oficial completa.
- `NAO_VERIFICADO`: procedimento ou relação CBO não foi carregado integralmente para a competência.

### 3. CID habilitado ao procedimento

Aplicável a BPA-I somente quando a relação SIGTAP oficial do procedimento exigir CID.

- `CONFORME`: CID estruturalmente válido e presente na relação oficial.
- `NAO_CONFORME`: CID ausente, malformado ou não relacionado quando a relação exige CID.
- `NAO_APLICAVEL`: a relação oficial foi carregada integralmente e declara que o procedimento não possui relação/exigência de CID.
- `NAO_VERIFICADO`: não há evidência oficial suficiente para saber se a relação CID foi carregada ou se é exigida.

### 4. Serviço/classificação habilitados ao procedimento no SIGTAP

Esta regra é exclusivamente SIGTAP. Ela não consulta serviços, classificações ou habilitações do CNES.

- Quando o SIGTAP listar pares para o procedimento, o BPA-I deve informar um par e ele deve constar exatamente na lista oficial.
- Os códigos são normalizados como texto numérico, preservando zeros à esquerda: `121/003` é diferente de `121/3` quando a fonte oficial os distinguir; a normalização só elimina diferenças de tipo JSON, não altera o código oficial.
- `CONFORME`: par informado e encontrado na relação SIGTAP completa.
- `NAO_CONFORME`: par ausente ou fora da relação SIGTAP completa.
- `NAO_APLICAVEL`: relação completa sem pares exigidos para o procedimento.
- `NAO_VERIFICADO`: relação de serviços/classificações indisponível ou parcial.

### 5. CNS do profissional

Aplicável a BPA-I. O CNS deve conter quinze dígitos, começar por `1`, `2`, `7`, `8` ou `9`, não ser uma sequência de dígitos repetidos e satisfazer o cálculo de Módulo 11 usado pelo sistema DATASUS.

- `CONFORME`: todas as verificações matemáticas passam.
- `NAO_CONFORME`: qualquer verificação falha.

## Integração e segurança do fluxo

1. `PenteFinoEngine` solicita as bases por competência antes de chamar `BpaAuditCore`.
2. O adaptador SIGTAP não poderá usar `KNOWN_PROCS` ou outra relação local estática para aprovar CBO, CID ou par serviço/classificação.
3. O adaptador CNES não poderá usar `cns_<CNS>`, CNES hardcoded, outra competência ou dados sintéticos como confirmação de lotação.
4. A consolidação das cinco regras preservará qualquer `ALERTA` e `NAO_VERIFICADO`; ambos bloqueiam o parecer de envio.
5. O botão de confirmação BPA usará um único gate canônico. A animação 3D e o fluxo sem animação consultarão o mesmo resultado; não haverá caminho que ignore a auditoria.
6. O relatório exibirá linha, competência, CNES, procedimento, regra, estado, evidência esperada/encontrada e ação corretiva. CNS será mascarado na interface e em exportações destinadas ao usuário.

## Arquivos previstos

- `code_sandbox_light_git_fe61910d_1781185357/js/bpa-audit-core.js`: avaliações determinísticas das cinco regras e normalização de códigos.
- `code_sandbox_light_git_fe61910d_1781185357/js/sigtap-audit-api.js`: contrato e cobertura das relações oficiais SIGTAP.
- `code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-engine.js`: carregamento das fontes, consolidação fail-closed e gate de envio.
- `code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-3d-renderer.js` e `index.html`: resultado/gate e ligação correta do botão de envio.
- `scripts/tests/bpa-audit.test.cjs` e `scripts/tests/pente-fino-regras.test.cjs`: testes de regressão e casos de fronteira.

## Critérios de aceitação e testes

1. Arquivo estruturalmente inválido, alerta, duplicidade ou relação pendente nunca gera `podeEnviarSemGlosa: true`.
2. CNS presente apenas em outro CNES nunca aprova a Regra 1.
3. Aliases só valem quando declarados na fonte CNES da mesma competência.
4. CBO alfanumérico, inexistente ou incompatível falha; relação SIGTAP ausente bloqueia sem glosa definitiva.
5. CID é exigido somente quando a relação oficial indicar exigência; relação completa sem CID torna a regra não aplicável.
6. Pares numéricos/string equivalentes da mesma codificação SIGTAP passam; par fora da lista falha; lista ausente bloqueia.
7. Vetores válidos e inválidos de CNS cobrem prefixo, repetição, tamanho e dígito verificador.
8. O botão “Ver linhas com glosa” renderiza os achados e o botão final de envio só é habilitado após parecer aprovado.

## Fora de escopo

- Situação, desligamento e desativação do profissional no CNES.
- Serviços, classificações e habilitações cadastrados no CNES.
- Qualquer inferência clínica ou autorização fora das relações oficiais carregadas pelo SIGTAP.
