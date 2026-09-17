# CNES Bacabal: avaliação da proposta PySUS

## Situação encontrada

O módulo atual não faz atualização mensal automática de profissionais. `server.js` atende primeiro arquivos JSON locais e só consulta a API aberta de estabelecimentos quando não há arquivo; a consulta usa `limit=50`, sem paginação. `scripts/ingest_datasus_cnes.ps1` copia a base local e muda a competência declarada, sem ler os registros do mês solicitado. A interface contém uma lista fixa de competências, pode carregar Supabase sem filtro de competência, gera equipes quando uma unidade não tem profissionais e calcula algumas movimentações com dados simulados. Essas rotinas não são evidência histórica para BPA.

O arquivo local de agosto de 2026 tem 130 estabelecimentos e 3.091 entradas de profissional/vínculo, mas não traz hash do arquivo bruto nem garante a separação entre pessoa e vínculo. A migration atual concede `FOR ALL TO anon` nas tabelas CNES; por isso ela não é destino adequado para novos identificadores pessoais ou payload bruto sem revisão de acesso. O servidor também tinha uma chave de fechamento ausente em `lib/siasus-sync-service.js`, que impedia o arranque; a correção mínima foi feita durante o teste de integração.

## O que a proposta melhora

| Critério | Fluxo atual | Fluxo ST/PF automático para Bacabal |
| --- | --- | --- |
| Competência | Arquivo de agosto e lista visual fixa | Somente meses encontrados em ST e PF e efetivamente publicados |
| Aquisição | Download/importação manual e API limitada a estabelecimentos | Descoberta no FTP DATASUS e aquisição PySUS por grupo e competência |
| Identidade e vínculo | Pessoa e vínculo misturados no JSON/tabela | CNS separado de cada vínculo, com CBO e carga horária preservados |
| Falha | Pode cair em dados gerados ou publicar parcialmente | Aborta layout inválido; mantém a revisão ativa anterior |
| Republicação | Sobrescrita ou ausência de verificação | SHA-256 e revisão imutável por competência |
| Auditoria BPA | Apenas competência com snapshot real deve ser usada | Snapshots mensais reais, sem extrapolar cadastro atual para o passado |

PySUS 2.11.2 documenta `pysus.ftp.cnes` e `source="origin"`, mas a chamada deve informar `group="ST"` e `group="PF"` separadamente. A descoberta precisa conferir o FTP diretamente: a função de alto nível consulta metadados do catálogo antes de baixar da origem, e esse catálogo pode atrasar. [Documentação de fontes PySUS](https://pysus.readthedocs.io/pt/latest/databases/data-sources.html), [guia FTP PySUS](https://pysus.readthedocs.io/en/latest/guides/ftp.html).

## Verificação com a fonte real em 16/09/2026

O comando `check` do worker encontrou `PFMA2608.dbc` (8.598.852 bytes) e `STMA2608.dbc` (342.279 bytes) no FTP do DATASUS, ambos com metadado de modificação em 15/09/2026. O worker baixou e publicou 202607 e 202608 para Bacabal; o manifesto ativo ficou em 202608. O segundo `sync 202608` retornou `unchanged`, mantendo a revisão 1.

| Medida Bacabal | Arquivo legado de agosto | FTP ST/PF julho | FTP ST/PF agosto |
| --- | ---: | ---: | ---: |
| Estabelecimentos | 130 | 117 | 117 |
| Profissionais distintos por CNS | 2.735 | 2.725 | 2.735 |
| Vínculos profissionais | 3.091 | 3.078 | 3.091 |
| Registros em quarentena | Não auditável | 0 | 0 |

Os 117 CNES de agosto do FTP também estão no legado; 13 CNES aparecem apenas no arquivo legado. O motivo dessa diferença requer conferência cadastral específica. Os vínculos coincidem na contagem total, mas o fluxo novo preserva a identidade de cada vínculo e os hashes dos arquivos brutos. A comparação entre julho e agosto encontrou 25 vínculos presentes só em agosto, 12 presentes só em julho e 1 alteração de carga horária. Essas diferenças são eventos entre arquivos mensais, sem inferir data exata de admissão, desligamento ou glosa.

O ST de disseminação não traz nome fantasia. A API mantém o snapshot oficial com o identificador CNES e adiciona `nomeReferenciaLegado` quando o mesmo CNES existe no arquivo local; a interface sinaliza essa origem auxiliar. O BPA usa o snapshot com hash, competência e cobertura ST/PF; serviços e habilitações continuam como verificações não concluídas.

## Limites da implantação inicial

O recorte implementado atende Bacabal (IBGE 210120) com ST/PF histórico e sincronização diária em processo Node persistente com `.venv` ou `CNES_PYTHON`. A validação real do FTP e de duas competências foi concluída neste workspace. O SOAP oficial para cadastro corrente, os grupos SR/HB/LT/EQ, Parquet/DuckDB e a migração transacional ao PostgreSQL continuam fora deste recorte. O serviço SOAP tem contrato e autenticação próprios; o histórico de produção permanece associado à competência do arquivo DATASUS. Em hospedagem estática ou efêmera, a rotina precisa de um agendador externo e volume persistente compartilhado antes de ser considerada ativa em produção. Os dados publicados localmente são ignorados pelo Git.
