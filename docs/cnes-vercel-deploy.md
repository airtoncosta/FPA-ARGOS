# CNES cifrado na Vercel

A implantação Vercel deve usar a raiz deste repositório como **Root Directory**. Assim, as functions `api/cnes/municipio.js`, `api/cnes/bacabal.js` e `api/cnes/estabelecimentos.js` e os blobs versionados em `data/cnes-encrypted/` são empacotados juntos.

Configure no ambiente de produção, sem versionar valores:

- `SUPABASE_URL` e `SUPABASE_ANON_KEY`, usados apenas para validar o JWT da sessão em `auth/v1/user`;
- `CNES_SNAPSHOT_KEY`, a chave hexadecimal AES-256-GCM que decifra os blobs CNES no processo da function.

As rotas exigem `Authorization: Bearer <access_token>` de uma sessão Supabase válida. Elas retornam `401` para sessão ausente ou inválida, `503` quando a autenticação ou o armazenamento cifrado não estão configurados e `404` para competência não publicada. Os caminhos estáticos `cnes_data/**` são redirecionados para a function e não podem entregar JSON CNES diretamente.

O cliente obtém o token de `SupabaseConfig.getClient().auth.getSession()` após login. O fallback RPC que não produz sessão não autoriza leitura CNES.
