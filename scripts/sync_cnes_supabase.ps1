# Desativado: o fluxo legado enviava dados de agosto com tipo de vínculo
# presumido e marcações de Portaria 134 inferidas para tabelas de escrita anon.
# A migração de snapshots exige tabela privada, política RLS revisada e
# credencial de serviço apenas no servidor; nenhum desses requisitos é suprido
# por este script.
throw 'Sincronização CNES legada desativada. Utilize somente o worker ST/PF e uma publicação autenticada de snapshots validados.'
