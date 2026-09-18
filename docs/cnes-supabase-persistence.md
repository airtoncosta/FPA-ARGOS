# Persistência CNES no Supabase

As tabelas legadas `cnes_estabelecimentos` e `cnes_profissionais` contêm apenas a carga antiga de agosto e não devem ser usadas como fonte para a consulta da Portaria 134. A carga ST/PF auditada de Bacabal está versionada em `data/cnes-encrypted/` para junho, julho e agosto de 2026. Os envelopes são cifrados; a chave fica fora do Git em `data/cnes/.snapshot-key`.

Para registrar as três competências no Supabase sem expor CNS e nomes em tabelas públicas:

1. Execute `code_sandbox_light_git_fe61910d_1781185357/supabase/migration_cnes_encrypted_snapshots.sql` no SQL Editor do projeto.
2. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `CNES_SNAPSHOT_KEY` no ambiente local seguro. O último valor deve ser o conteúdo da chave local ignorada pelo Git. Nunca use a chave `anon` como service role.
3. Execute `node scripts/upload_cnes_snapshots_supabase.js`. O carregador valida hash, escopo, contagem e decriptação de cada snapshot, insere uma revisão imutável e confere o hash persistido após cada carga.

A função da Vercel usa os mesmos blobs cifrados versionados no Git. O Supabase conserva uma segunda cópia persistente auditável, mas a API não depende da disponibilidade dessa tabela. Revisões anteriores permanecem preservadas.
