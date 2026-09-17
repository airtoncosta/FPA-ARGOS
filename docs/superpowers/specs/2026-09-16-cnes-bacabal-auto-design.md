# CNES Bacabal: sincronização histórica automática

## Decisão

O ARGOS usará os arquivos mensais ST e PF de MA publicados pelo DATASUS para atualizar somente Bacabal (IBGE 210120). Um worker Python isolado descobrirá competências no FTP oficial por meio do PySUS, baixará as duas famílias, validará o layout e a competência, e gerará um snapshot imutável por versão. A publicação ocorrerá por troca atômica de um manifesto; o snapshot anterior continuará disponível se qualquer etapa falhar.

O servidor Node continuará atendendo o módulo CNES. Ele escolherá a competência publicada mais recente pelo manifesto, sem depender da lista fixa de meses no navegador. O worker não fará chamadas SOAP nem gravará no Supabase nesta primeira etapa: o serviço SOAP exige autenticação operacional e a migração SQL atual concede escrita anônima, inadequada para dados profissionais. Esses dois caminhos só poderão ser ativados após configuração e revisão de acesso.

## Dados e limites

- Escopo geográfico fixo: Bacabal/MA, IBGE 210120. A leitura remota é por UF, mas nenhum registro de outro município é publicado.
- Fonte histórica: CNES ST e PF da mesma competência, `source="origin"`, com seleção explícita de grupo. A descoberta usa listagem do FTP, para não depender da atualização do catálogo espelhado.
- Campos obrigatórios: competência, código municipal, CNES; para PF, CNS e CBO. CPF nunca substitui CNS. Colunas ausentes ou competência divergente abortam o lote. Registros inválidos ficam em quarentena privada e impedem publicação até revisão, para não anunciar cobertura completa de modo falso.
- Cada vínculo PF é mantido separadamente com atributos de vínculo, CBO e carga horária. O JSON público conserva a estrutura consumida pelo módulo; o snapshot privado preserva o vínculo completo e a origem. Dados brutos e artefatos temporários ficam fora do diretório servido.
- Um manifesto registra competência, origem, hash dos arquivos e do snapshot, contagens, horário e versão. Novo hash da mesma competência cria outra versão; a versão anterior permanece. Uma repetição com os mesmos hashes é idempotente.
- Apenas o snapshot publicado entra na auditoria BPA. Serviços e habilitações permanecem com cobertura `false` até importação específica. Nenhuma lista artificial de competências ou profissional inventado será usada como evidência.

## Operação

O worker oferece `check`, `sync` e `backfill`. Em um host Node persistente, o servidor executa `sync` no arranque e diariamente quando encontra `.venv` ou `CNES_PYTHON`; `CNES_SYNC_ENABLED=0` desativa a rotina. O processo também pode ser invocado por um agendador externo. Falhas preservam o último snapshot válido e ficam registradas no log. O FTP, o layout e duas competências reais foram verificados localmente em 16/09/2026. A implantação em hospedagem estática ou efêmera precisa de um agendador e armazenamento persistente próprios.

## Verificação

Testes de contrato com tabelas ST/PF pequenas cobrem filtro geográfico, múltiplos vínculos, CPF/CNS, layout ausente, competência incorreta, idempotência, republicação e falha antes da troca de manifesto. Testes Node verificam seleção da competência publicada e fallback para o arquivo legado quando não houver manifesto novo. Um ensaio com o ZIP 202608 existente ajuda a comparar contagens, mas esse ZIP tem formato diferente do ST/PF de disseminação e não substitui a homologação PySUS online.
