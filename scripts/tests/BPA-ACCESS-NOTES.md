# Produção BPA: escopo e validação

## Implementado no cliente

Somente role ADM ou username francileide têm visão geral. Os demais usuários veem unidades atribuídas ao seu username ou nome completo. O escopo se aplica à listagem, indicadores, checklist, seleção de unidade, downloads, exclusão e e-mail. Exclusão ainda exige autoria ou privilégio administrativo.

CNES divergentes não são conciliados pelo nome. Atribuição vazia remove o vínculo mesmo se existir alias antigo. Consultas de produções usam CNES permitidos; registros legados sem CNES usam nomes completos. As configurações são carregadas antes das produções, e erros de permissão ou de rede não liberam acesso local. A ausência confirmada da tabela de produções (PGRST205/42P01) ativa o armazenamento local existente, sempre filtrado pelas unidades permitidas.

O cache de consulta é separado por conta. A base local histórica argos_producoes_bpa é recuperada e preservada. Gravações locais atualizam somente o registro autorizado e mantêm os arquivos de outras unidades; ADM e Francileide podem consultá-los no mesmo navegador. A gravação de responsáveis é aguardada, com erros apresentados. A entrada no módulo recarrega atribuições.

Upload aceita TXT e extensões de JAN a DEZ. Arquivos desconhecidos não recebem automaticamente a primeira unidade.

## Proteção no servidor ainda pendente

As mudanças restringem o fluxo da aplicação, mas NÃO estabelecem autorização confiável no servidor.

A migration_producoes_bpa.sql concede acesso anônimo amplo à tabela e expõe fn_listar_producoes_bpa como SECURITY DEFINER sem verificar a identidade do usuário. O login atual usa fn_verify_login e dados de perfil no navegador, sem criar uma sessão Supabase Auth. Não basta confiar no username enviado pelo cliente.

Para concluir o isolamento real:

1. Vincular o login a uma identidade verificável pelo servidor, com Supabase Auth ou sessão opaca validada no backend.
2. Persistir vínculos por identificadores estáveis de usuário e unidade, com alteração exclusiva para ADM e a conta autenticada da Francileide.
3. Restringir tabela e RPC à identidade autenticada e revogar as permissões anônimas abrangentes.
4. Aplicar o mesmo controle aos endpoints e à função de e-mail que modificam registros BPA.
5. Testar acesso direto com duas contas reais, incluindo tentativas de informar o username de outra pessoa.

Não houve alteração no banco remoto nem deploy nesta tarefa. Alterações anteriores de login e layout na árvore de trabalho foram preservadas.

## Validação

Executar: node scripts/tests/bpa-access.test.cjs

23 testes de escopo, falhas de persistência e recuperação local no perfil Ewerton. Não substituem testes de autorização no banco e inspeção visual em navegador autenticado.

## Proposta de melhoria dos anexos

Formatos confirmados pelo usuário: somente arquivos BPA exportados, TXT ou extensão mensal.

- Seleção múltipla ou arrastar vários arquivos.
- Conferência antes de salvar: arquivo, unidade/CNES, competência, BPA-C ou BPA-I e resultado da validação.
- Sinalização individual de duplicados, CNES fora do escopo e campos não reconhecidos.
- Organização por unidade e competência, com espaços BPA-C/BPA-I e indicação do que falta.
- Histórico de versões, preservando o original e identificando o envio vigente.

Seleção múltipla e histórico são propostas, ainda não implementadas.

## Diagnóstico confirmado da regressão

Em 15/09/2026, consulta de leitura à API configurada retornou 200 para configurações (sem linhas BPA) e 404/PGRST205 para producoes_bpa. A dependência obrigatória da tabela inexistente zerava a interface. Foi restaurado o modo local nesse caso específico, com aviso explícito. Nenhuma migração remota foi executada.
