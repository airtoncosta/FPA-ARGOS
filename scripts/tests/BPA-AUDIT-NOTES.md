# Auditoria BPA: funcionamento e limites

## Implementação

O botão audita o conteúdo do arquivo selecionado, sem dados simulados nem troca pelo APP_STATE. Parser compartilhado com upload: campos posicionais dos registros 02 (48 caracteres) e 03 (349 caracteres) do layout de exportação local. O exportador pode acrescentar até dois caracteres de extensão antes do CR/LF sem gerar falso erro de estrutura. Preserva linha física, CNES, CNS profissional, CBO, data de atendimento, procedimento, CID, sexo, quantidade, idade, nascimento, serviço, classificação e CPF.

Verifica cabeçalho, contagem e campo de controle; formatos; CNS/CPF com dígitos; datas; idade calculada; vínculo CNS+CBO+CNES na competência; existência do procedimento; relações exatas SIGTAP; instrumento; CID; serviço/classificação; habilitações; idade em meses; quantidade por registro quando aplicável; duplicidades exatas como alertas. Quando a tabela traz `vl_sa`, calcula o valor de referência ambulatorial por quantidade e soma o arquivo. Valor ausente permanece não disponível; valor zero é válido. Não usa prefixos de procedimento, idade padrão, limite arbitrário 10, valor médio nem códigos inventados de glosa.

BPA-C não identifica CNS, CPF, CID e sexo individual. Sua quantidade agregada não é comparada ao limite por paciente. Idade anual na fronteira de uma faixa em meses fica não verificada quando não há nascimento.

## Bases

CNES: audit_data/manifest.json aponta somente para o dump 202608 realmente importado. A lista de meses da interface não comprova disponibilidade histórica. Serviços e habilitações não estão completos na base atual e não são inventados. O motor ignora os profissionais/serviços de demonstração gerados pela normalização visual do módulo CNES.

SIGTAP: consulta a API que já alimenta o projeto, https://sigtap-api.vercel.app/api/v1/sigtap/procedimentos/ . A API é um serviço terceiro; não foi chamada de endpoint oficial do Ministério. O parâmetro competencia é obrigatório, e o retorno precisa confirmar o mesmo mês. CBO, CID, serviços, habilitações, atributos e compatibilidades percorrem todas as páginas, validando count, next e competência. Somente procedimento e competência saem do navegador, sem CNS, CPF, nome ou conteúdo do BPA.

A API retorna regras condicionadas e atributos cujo contexto nem sempre pode ser inferido do BPA. Regras ainda não implementadas aparecem como NAO_VERIFICADO com a descrição recebida. Isso impede declarar o arquivo plenamente conforme. Quantidade 9999 no SIGTAP é tratada como limite não aplicável. Limites por dia, paciente ou tratamento não são inferidos de limites por registro.

## Resultados

- NAO_CONFORME: pelo menos uma não conformidade encontrada. Pode haver também verificações pendentes.
- INCONCLUSIVO: nenhuma não conformidade confirmada, mas há dados/regras ausentes ou alertas.
- CONFORME: registros reais presentes, nenhuma falha, nenhum alerta ou regra aplicável pendente dentro do escopo implementado.

O resultado não garante aprovação pelo SIA/SUS. Tela com evidências por linha, bases/competências, filtro, paginação, valor SA e exportação. O valor nas linhas apontadas é apenas referência financeira da tabela; não calcula glosa evitada nem retém automaticamente produções.

## Histórico CNES

Obter o dump oficial de cada mês necessário e convertê-lo preservando a competência real. Depois registrar o snapshot normalizado:

    node scripts/register_cnes_audit.cjs caminho_snapshot.json AAAAMM

O arquivo deve conter competencia (ou versao AAAA.MM), fonte do dump oficial, estabelecimentos e profissionais. Serviços e habilitações exigem cobertura explícita e listas importadas integralmente. O script grava snapshot por competência e hash; não altera o arquivo de agosto. Não usar datas de admissão isoladas para reconstruir vínculos históricos.

## Validação

    node --test scripts/tests/bpa-audit.test.cjs scripts/tests/sigtap-audit-api.test.cjs scripts/tests/bpa-access.test.cjs

54 testes automatizados, além de consulta real à API para 202608 e teste visual de diagnóstico com arquivo sintético explicitamente identificado. Nenhuma produção real foi transmitida ou modificada para teste.

## Fontes técnicas

- Manual BPA: https://wiki.saude.gov.br/sia/index.php/BPA
- Atributos SIGTAP: https://wiki.datasus.gov.br/sigtap/index.php/Procedimento
- Documentos oficiais BPA: https://sia.datasus.gov.br/documentos/listar_ftp_bpa.php
- Layout local consultado: C:/RAAS/Layout_Exportacao_BPA.pdf. O portal anuncia versão de julho/2026; layouts com comprimento não reconhecido são apontados e não aprovados silenciosamente.
- Contrato da API: https://sigtap-api.vercel.app/api/schema/

## Pendências para cobertura integral

Importar histórico CNES e relações de serviços/habilitações por mês. Implementar regras condicionadas adicionais a partir das respectivas normas e do contexto exigido. Homologar novos layouts contra o PDF oficial correspondente e arquivos reais representativos, sem presumir que todas as versões têm o mesmo comprimento.
