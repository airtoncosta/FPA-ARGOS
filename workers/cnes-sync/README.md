# CNES sync worker — Bacabal-MA

Worker Python para publicar dados CNES de Bacabal-MA (IBGE `210120`) a partir dos grupos oficiais `ST` e `PF`. Ele só troca o manifesto após encontrar os dois arquivos, validar o layout e os identificadores e gravar o snapshot.

## Instalação

Use Python 3.11 a 3.13. Na raiz do projeto:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r workers/cnes-sync/requirements.txt
```

No Linux, use `.venv/bin/python` nos mesmos comandos. O PySUS guarda seu cache em `data/cnes/pysus-cache/`, dentro da área privada.

## Operação

```powershell
.venv\Scripts\python.exe workers/cnes-sync/cnes_sync.py check
.venv\Scripts\python.exe workers/cnes-sync/cnes_sync.py sync
.venv\Scripts\python.exe workers/cnes-sync/cnes_sync.py sync 202608
.venv\Scripts\python.exe workers/cnes-sync/cnes_sync.py backfill 202601 202608
```

As opções `--private-root` e `--public-root` permitem apontar os diretórios antes do subcomando. Os valores padrão são `data/cnes/` (privado) e `code_sandbox_light_git_fe61910d_1781185357/cnes_data/auto/` (público).

Em um servidor Node persistente, o `server.js` inicia uma verificação e sincronização no arranque e repete a cada 24 horas quando encontra `.venv` na raiz ou `CNES_PYTHON` configurado. `CNES_SYNC_ENABLED=0` desliga essa rotina. O agendador não executa ciclos sobrepostos. Os snapshots e o manifesto precisam estar no mesmo volume persistente usado pelo servidor HTTP. Hospedagem estática ou execução sem processo persistente exige agendamento externo e armazenamento compartilhado; a rotina Node não consegue atualizar uma implantação Vercel estática por si só.

## Contrato dos artefatos

- `data/cnes/snapshots/<competência>/rev-<n>-<sha256>.json` guarda snapshots imutáveis e `data/cnes/manifest.json` é trocado atomicamente.
- O manifesto público aponta para `snapshots/...` por caminho relativo e inclui `snapshot.sha256`, permitindo que o consumidor Node confira o conteúdo antes de o usar.
- O artefato público inclui CNS pois ele é necessário para os vínculos atuais. Ele não inclui CPF, linhas brutas, credenciais ou arquivos de quarentena.
- Uma mudança em ST ou PF na mesma competência gera nova revisão; hashes iguais deixam a revisão existente intacta.
- Qualquer quarentena, coluna obrigatória ausente, competência divergente ou ausência de ST/PF impede a publicação e mantém o manifesto anterior.

## Limite de homologação

Os testes automatizados usam tabelas pequenas e stubs. Em 16/09/2026, `check` encontrou `PFMA2608.dbc` e `STMA2608.dbc` no FTP DATASUS. Uma execução real de `sync` publicou 202607 e 202608 para Bacabal, com 3.078 e 3.091 vínculos, respectivamente; um segundo `sync 202608` retornou `unchanged` na revisão 1. Esses arquivos ficam ignorados pelo Git. O worker usa o cliente FTP do PySUS diretamente, sem depender da atualização do catálogo DuckLake.
