# Auditoria CNES e vínculos — plano de execução

**Objetivo:** identificar e corrigir divergências entre o CNES local, a implantação e a marcação da Portaria SAS/MS 134/2011, preservando competência, origem e identidade dos vínculos.

**Arquitetura:** manter snapshots mensais imutáveis, validados por SHA-256. A interface deve separar marcação oficial comprovada, ausência de cobertura e triagem calculada no recorte municipal. O caminho publicado deve funcionar sem depender do disco da estação que executou o worker.

**Tecnologias:** Node.js, JavaScript sem framework, Python/PySUS, Supabase/PostgREST, Vercel.

**Autorização:** o usuário solicitou auditoria minuciosa e implementação das correções. Sol e Terra executam subtarefas com esforço alto. Não modificar dados profissionais ou justificativas no CNES oficial.

## Critérios de aceitação

- [x] Reproduzir regras locais responsáveis pela sinalização e consultar documentação oficial.
- [x] Inventariar competências reais e distinguir arquivos locais, artefatos publicados e registros no banco.
- [x] Confirmar causa da diferença local/deploy com evidência de configuração e respostas HTTP.
- [ ] Criar regressões que falham antes da correção: múltiplos CBOs, marcação sem fonte, soma >60h, primeira ocorrência por CNS, competência ausente.
- [ ] Corrigir exibição, filtro, exportação e ficha de vínculos usando a mesma regra.
- [ ] Garantir carregamento de snapshots persistidos em ambiente publicado e erro explícito para competência indisponível.
- [ ] Verificar importadores quanto a invenção de competências, padrões de vínculo, identidade e cobertura.
- [ ] Executar testes Node/Python aplicáveis, exercitar APIs e revisar o diff de forma independente.
- [ ] Entregar relatório de auditoria com contagens, fontes oficiais, correções e limitações verificadas.

## Divisão de trabalho

1. **Sol — regras e interface:** `js/cnes-module.js`, `js/cnes-diff-engine.js`, `js/cnes-municipios-base.js` e testes do módulo/diff. Criar casos sintéticos antes de corrigir. Carga horária >60h não pode produzir automaticamente “Artigo 2º”. Não misturar pessoas e linhas de vínculo. Mostrar todos os vínculos da pessoa selecionada.
2. **Terra — persistência e deploy:** mapear snapshots, tabelas, APIs e configuração de implantação; consultar apenas contagens agregadas e metadados, protegendo credenciais. Definir correção a partir do diagnóstico, sem sobrescrever histórico válido.
3. **Sol — ingestão:** conferir layouts e transformações dos importadores, duplicações, inferências e competências. Corrigir causas confirmadas com testes antes do patch.
4. **Coordenador:** verificar fontes oficiais, consolidar evidências, implementar integrações restantes, revisar resultados e documentar limites. Não atribuir à base nacional um alerta produzido exclusivamente pelo ARGOS.

## Referências oficiais consultadas

- https://cnes.datasus.gov.br/pages/profissionais/consulta.jsp — consulta atual, vínculos públicos e CHS superior a 168 horas.
- https://wiki.datasus.gov.br/cnes/index.php/Portal_CNES — consultas e justificativas da Portaria 134, arts. 3º e 5º.
- https://wiki.datasus.gov.br/cnes/index.php/SCNES_-_Guia_de_Preenchimento — vínculos, formas de contratação, CBO, carga horária e desligamentos.

## Evidência inicial

- Base dos nove testes Node existentes do módulo, snapshots e diff passou antes das alterações.
- `cnes-module.js` rotula inferência municipal >60h como “Artigo 2º”; os snapshots ST/PF não contêm a anotação oficial da Portaria 134.
- Os snapshots automáticos ficam em caminhos ignorados pelo Git. O agendador Node local não publica esses dados no ambiente Vercel.
- O Supabase atual contém apenas 202608 (130 estabelecimentos/3.091 linhas) do legado, com tipo contratual presumido; 202606 e 202607 ausentes. O projeto Vercel não inclui as rotas Node de `server.js`.
- 202606 foi importado de `PFMA2606.dbc` e `STMA2606.dbc` (116 estabelecimentos, 2.722 CNS distintos, 3.072 vínculos, quarentena zero). 202607/08 foram recompostos como revisões 2 sem marcações inferidas, com 3.078/3.091 vínculos; SHA-256 confirmado.
- O script legado `enrich_cnes_bacabal.py` inseriu 419/417 falsos campos `portaria134` nos artefatos públicos de julho/agosto e recalculou o hash. Foi desativado junto com gerador, relabelador de competência e sincronizador Supabase anônimo.
- O repositório iniciou sem alterações rastreadas; `.agents/plugins/` já estava não rastreado e será preservado.
