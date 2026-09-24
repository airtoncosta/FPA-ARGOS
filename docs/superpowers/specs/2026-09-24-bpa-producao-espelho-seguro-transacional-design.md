# BPA interno: persistência transacional, espelho seguro e operação sem transmissão SIA/SUS

**Data:** 24/09/2026  
**Status:** Design aprovado pelo responsável técnico  
**Escopo:** Supabase Auth, RLS por município/CNES, persistência atômica de produção e espelho, outbox/reconciliação, estados operacionais e e-mail auditável

## 1. Objetivo

O FPA ARGOS é um sistema interno de setor. Ele não transmite produção ao SIA/SUS e não deve apresentar nenhum estado local como se tivesse realizada essa transmissão.

O objetivo deste ciclo é garantir que:

1. a produção BPA seja persistida de forma confiável no Supabase;
2. o espelho profissional seja gravado na mesma transação da produção;
3. falhas de rede não apaguem nem desfaçam a produção confirmada;
4. operações repetidas sejam idempotentes;
5. usuários só leiam e alterem dados de municípios e CNES autorizados;
6. a interface diferencie sincronização local, sincronização cloud, auditoria, e-mail e qualquer conceito de transmissão externa;
7. existam health checks, reconciliação e testes de integração para detectar divergências.

## 2. Decisões aprovadas

- **Identidade:** Supabase Auth.
- **Login:** e-mail; username permanece apenas como perfil interno.
- **Migração de usuários:** migrar usuários existentes para Auth, com senha temporária aleatória e troca obrigatória no primeiro acesso.
- **Isolamento:** município + CNES.
- **Escopo SIA/SUS:** fora do sistema. Não implementar transmissão, aceite ou protocolo SIA/SUS.
- **Escopo de entrega:** código, migrations, scripts seguros, testes e roteiro de aplicação administrativa. A migration não será aplicada remotamente nesta tarefa.
- **Escopo de e-mail:** manter o envio de anexo existente, mas separar claramente persistência, entrega real, falha e simulação.
- **Arquitetura preferida:** RPC transacional no Supabase, com RLS, em vez de inserts independentes do navegador.

## 3. Arquitetura de dados

### 3.1 Identidade e perfis

`auth.users.id` será a identidade de segurança. O perfil legado em `public.usuarios` receberá uma coluna de vínculo, como `auth_user_id UUID UNIQUE REFERENCES auth.users(id)`, preservando username, nome, papel e situação operacional.

A migration de usuários Auth será executada por script administrativo que recebe a credencial de serviço por variável de ambiente ou Secret Manager. Nenhuma service-role key, senha de usuário ou segredo SMTP será gravado no repositório.

### 3.2 Escopo de município e CNES

Criar tabelas de autorização:

```sql
usuario_municipios (
  usuario_id UUID REFERENCES auth.users(id),
  municipio_id UUID REFERENCES public.municipios_sistema(id),
  papel TEXT NOT NULL,
  PRIMARY KEY (usuario_id, municipio_id)
)

usuario_cnes (
  usuario_id UUID REFERENCES auth.users(id),
  municipio_id UUID REFERENCES public.municipios_sistema(id),
  cnes VARCHAR(20) NOT NULL,
  PRIMARY KEY (usuario_id, municipio_id, cnes)
)
```

As tabelas serão protegidas por RLS e tarefas administrativas. O frontend não escolherá livremente `municipio_id`, `cnes` ou `usuario_id`; a RPC derivará e validará o escopo a partir de `auth.uid()`.

### 3.3 Produção e espelho

`producoes_bpa` receberá, além dos campos existentes:

```text
client_operation_id UUID NOT NULL UNIQUE
municipio_id UUID
cnes VARCHAR(20)
status_producao VARCHAR(40) NOT NULL
status_auditoria VARCHAR(40)
fingerprint VARCHAR(128)
total_apontamentos INTEGER
auditado_em TIMESTAMPTZ
espelho_status VARCHAR(40)
espelho_sincronizado_em TIMESTAMPTZ
```

A tabela `espelho_producao_profissional` será criada com FK para `producoes_bpa`, colunas de município/CNES, identificação do profissional, procedimentos JSONB e totais.

Constraint de unicidade lógica:

```text
(producao_id, cns_profissional, cbo)
```

Isso impede linhas duplicadas para a mesma combinação de produção, profissional e CBO. O `producao_id` deve ser o ID definitivo retornado pela gravação transacional; IDs locais não serão enviados ao banco cloud antes da confirmação.

## 4. Segurança e RLS

### 4.1 Remoção de acesso anônimo

As políticas `TO anon ... USING (true) WITH CHECK (true)` de `producoes_bpa` e do espelho serão removidas. O acesso de aplicação será concedido somente a `authenticated`.

As tabelas de produção, espelho, escopo e reconciliação terão RLS habilitada. Funções auxiliares devem usar `SECURITY DEFINER` apenas quando necessário, com `search_path` fixo, validação de `auth.uid()` e nenhum parâmetro de escopo confiável vindo do cliente.

### 4.2 Regras de acesso

- Usuário só seleciona linhas de municípios vinculados ao seu Auth UID.
- Usuário só seleciona linhas de CNES autorizados dentro desses municípios.
- Inserção só ocorre se o CNES solicitado estiver autorizado.
- Atualização e exclusão exigem o mesmo escopo da linha.
- Administração de usuários exige papel administrativo explícito.
- Consultas de listagem devem filtrar no banco; filtragem somente no JavaScript é proibida para dados sensíveis.
- O conteúdo bruto do BPA não será retornado em listagens de resumo; será obtido por RPC/download autorizado somente quando necessário.

### 4.3 Sessão

A tela de login usará `supabase.auth.signInWithPassword` com e-mail. O frontend validará a sessão Auth com `getUser()` antes de habilitar BPA e espelho.

`argos_user` não será fonte de autorização. Poderá continuar como cache de apresentação, mas qualquer dado de escopo será revalidado pela sessão Auth e pela RPC.

O logout limpará sessão Auth, estado de usuário em memória e caches sensíveis locais. Registros ainda pendentes na outbox não serão apagados silenciosamente; serão marcados como pertencentes à conta e poderão ser recuperados em uma política explícita de logout/reentrada.

## 5. Gravação transacional

### 5.1 RPC

Criar `public.fn_salvar_producao_bpa_com_espelho(payload JSONB)` com as seguintes responsabilidades:

1. exigir sessão `authenticated` e `auth.uid()` válido;
2. validar município e CNES a partir do escopo do usuário;
3. validar os dados mínimos do arquivo e o conteúdo textual;
4. deduplicar por `client_operation_id`;
5. inserir ou retornar a produção existente;
6. inserir/atualizar as linhas do espelho com upsert por chave única;
7. calcular `espelho_status = 'ESPELHO_CONSISTENTE'` somente após todas as linhas serem gravadas;
8. registrar evento de auditoria da operação;
9. retornar produção, linhas e identificadores definitivos.

A função deve ser idempotente para repetição do mesmo `client_operation_id`. A repetição com conteúdo divergente deve falhar com erro explícito, sem sobrescrever silenciosamente o registro original.

### 5.2 Estados

Estados de produção:

```text
REGISTRADA
EM_PROCESSAMENTO
ESPELHO_CONSISTENTE
REPROCESSAMENTO_NECESSARIO
EXCLUIDA
```

Estados de auditoria:

```text
NAO_AUDITADA
CONFORME
COM_APONTAMENTOS
INCONCLUSIVA
```

O status genérico `ENVIADO` não será usado para representar transmissão ao SIA/SUS. Para este sistema interno, “registro interno” e “espelho consistente” são os estados principais.

## 6. Outbox local e resiliência

A outbox `argos_bpa_outbox` será versionada e namespaced por Auth UID e município. Cada item terá:

```text
client_operation_id
usuario_id
municipio_id
cnes
payload
versao
status
tentativas
ultimo_erro
criado_em
atualizado_em
```

Estados da outbox:

```text
PENDENTE
PROCESSANDO
CONCLUIDA
FALHA_PERMANENTE
```

O retry ocorrerá em:

- carregamento inicial;
- evento `online`;
- ação explícita “Sincronizar pendências”;
- intervalo limitado enquanto a aba estiver ativa.

A interface informará explicitamente:

- `salva localmente — aguardando sincronização`;
- `sincronizada no servidor`;
- `falha de sincronização — retry pendente`;
- `falha permanente — requer suporte`.

A conclusão cloud só será declarada após retorno bem-sucedido da RPC com o ID definitivo e `espelho_status = ESPELHO_CONSISTENTE`.

## 7. Espelho e leitura

A gravação do espelho ocorrerá exclusivamente dentro da RPC de produção. O `ProducaoProfissionalModule` será adaptador de apresentação/cache, não uma segunda fonte de gravação cloud.

A leitura cloud será paginada, filtrada pelo banco e ordenada por data. O limite fixo de 5.000 linhas será removido da lógica principal; a interface carregará páginas adicionais sob demanda ou por cursor.

A chave de merge local estável será:

```text
producao_id + cns_profissional + cbo
```

A nuvem prevalece em divergência, mas somente depois de autenticação e filtro de escopo. O cache local nunca será usado para ampliar o acesso do usuário.

O expurgo de órfãos será proibido enquanto a lista cloud não estiver confirmada e paginada. Exclusão de produção será uma operação autorizada e refletida no banco por cascade ou RPC; não será inferida de lista local vazia.

## 8. Reconciliação

Criar uma rotina autorizada `fn_reconciliar_producao_espelho` e um job/endpoint administrativo, sem execução automática destrutiva.

A reconciliação deve:

- localizar produção sem linhas de espelho;
- localizar linhas órfãs ou fora de escopo;
- comparar totais e contagens;
- verificar `fingerprint`, `client_operation_id` e coesão de município/CNES;
- registrar o achado em trilha de auditoria;
- reparar somente quando a reconstrução for determinística e autorizada;
- bloquear reparos quando houver conteúdo ausente ou conflito de conteúdo.

A reconciliação pode ser disparada no carregamento apenas em modo não destrutivo e por ação explícita para reparos. O sistema nunca deve apagar dados cloud com base apenas em cache local vazio.

## 9. E-mail

O e-mail é uma operação separada da persistência. O frontend deve enviar o anexo obtido da produção já sincronizada ou de uma cópia explicitamente identificada como local.

Estados:

```text
NAO_SOLICITADO
PENDENTE
ENVIADO
FALHA
SIMULADO
```

A Edge Function não pode retornar “entrega” quando `RESEND_API_KEY` não estiver configurada. Nesse caso, deve retornar `SIMULADO` ou `FALHA_CONFIGURACAO`, conforme a política escolhida, e a interface deve apresentar a diferença.

Não será criado estado de transmissão SIA/SUS. O sistema é interno e não integra o protocolo de envio do SIA/SUS neste escopo.

## 10. Operação e secrets

Entregar:

1. migrations SQL forward-only, sem `DROP TABLE` destrutivo;
2. script administrativo para criar/vincular usuários Auth, executado com Secret Manager;
3. health check de schema e escopo;
4. procedimento de logout/reentrada para contas migradas;
5. rotação de senha SMTP/Resend e remoção de segredos do histórico imediatamente quando possível;
6. roteiro de aplicação no painel administrativo do Supabase;
7. checklist de validação com usuário de dois municípios e dois CNES.

A anon key pode continuar sendo pública no frontend, mas não pode conceder acesso às tabelas protegidas. Service-role key nunca será usada pelo bundle do navegador.

## 11. Testes

### 11.1 SQL

- usuário A não lê município B;
- usuário A não lê CNES B;
- usuário A não altera nem exclui linha B;
- usuário autorizado grava município/CNES permitido;
- usuário não autorizado tenta gravar e recebe negação;
- `client_operation_id` repetido retorna o mesmo registro;
- conteúdo divergente com o mesmo operation ID é rejeitado;
- linhas do espelho não duplicam;
- falha de uma linha reverte toda a transação;
- reconciliação detecta produção sem espelho.

### 11.2 JavaScript

- login por e-mail com sessão Auth;
- inicialização bloqueada sem sessão;
- escopo obtido do perfil autorizado;
- outbox permanece após falha;
- retry ocorre em `online`;
- sucesso cloud só é exibido após RPC completa;
- espelho não usa mais delete+insert independente;
- paginação não é limitada a 5.000;
- e-mail simulado não aparece como enviado;
- logout não deixa autoridade no `argos_user`.

### 11.3 Integração

- insert cloud seguido de leitura autenticada;
- recuperação após falha de rede;
- reenvio idempotente;
- reconciliação após espelho ausente;
- isolamento entre duas contas reais de teste;
- execução de migrations em projeto de staging antes de produção.

Os mocks existentes serão mantidos como testes unitários, mas não serão usados como prova de segurança ou persistência real.

## 12. Critérios de aceite

A implementação será considerada pronta quando:

- nenhuma tabela de produção ou espelho permitir `anon` ler/escrever livremente;
- Auth e RLS estiverem testados em banco de staging;
- município/CNES forem validados no banco;
- produção e espelho forem gravados atomicamente;
- retry idempotente sobreviver a reinício e falha de rede;
- o espelho tiver constraint de unicidade e paginação;
- reconciliação for explícita e auditável;
- estados de e-mail forem separados de persistência;
- não existir transmissão SIA/SUS ou status que a sugira;
- a suíte completa passar;
- o roteiro de aplicação e validação estiver documentado;
- nenhuma credencial nova for adicionada ao repositório.

## 13. Fora de escopo

- transmissão, recepção ou aceite SIA/SUS;
- integração com o FTP oficial para aceitar produção;
- redefinição completa de todos os módulos do FPA ARGOS;
- centralização de todos os serviços em uma nova API;
- alteração do motor de auditoria clínica já validado, exceto para estados e metadados de persistência;
- aplicação remota da migration no projeto Supabase sem execução autorizada e credencial administrativa segura.
