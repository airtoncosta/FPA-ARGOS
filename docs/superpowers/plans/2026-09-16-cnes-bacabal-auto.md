# CNES Bacabal Automatic Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atualizar automaticamente snapshots CNES ST/PF de Bacabal por competência real, sem publicação parcial ou dados inventados.

**Architecture:** Worker PySUS isolado descobre arquivos FTP, normaliza Bacabal e publica snapshots imutáveis por manifesto atômico. Node consulta o manifesto e o módulo CNES utiliza apenas competências publicadas.

**Tech Stack:** Python 3, PySUS 2.11.2, Node.js 24, JSON, testes `unittest` e `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-16-cnes-bacabal-auto-design.md`

## Global Constraints

- Município único: IBGE `210120`, UF `MA`.
- Fonte histórica ST e PF da mesma competência; não sintetizar CNS, CBO, vínculo ou competência.
- Falha de coluna, identificador ou publicação preserva o snapshot anterior.
- Nenhuma credencial ou CPF no diretório público.

---

### Task 1: Contrato ST/PF e publicação local

**Files:** `workers/cnes-sync/cnes_sync.py`, `workers/cnes-sync/tests/test_cnes_sync.py`, `.gitignore`.

**Interfaces:** `normalize_tables(st_rows, pf_rows, competence) -> dict`; `publish_snapshot(snapshot, source_files, root) -> dict`.

- [x] Escrever testes para filtro IBGE, dois vínculos por CNS, validação de colunas/competência/CNS e publicação idempotente com republicação.
- [x] Executar `python -m unittest discover workers/cnes-sync/tests -v` e confirmar falhas esperadas.
- [x] Implementar normalização, hashes SHA-256, quarentena privada e troca atômica do manifesto.
- [x] Executar os mesmos testes e confirmar aprovação.

### Task 2: Aquisição PySUS e execução agendada

**Files:** `workers/cnes-sync/cnes_sync.py`, `workers/cnes-sync/requirements.txt`, `workers/cnes-sync/README.md`, `lib/cnes-sync-scheduler.js`, `test/cnes-sync-scheduler.test.js`, `server.js`.

**Interfaces:** CLI `check|sync|backfill`; `startCnesSyncScheduler(options)`.

- [x] Escrever testes de descoberta ST/PF, falha de fonte e execução única do scheduler.
- [x] Confirmar falhas dos testes novos.
- [x] Implementar listagem FTP via PySUS, download direto da origem, versão fixa e agendamento diário em Node persistente.
- [x] Rodar testes Python e Node; documentar configuração e homologar a origem FTP real.

### Task 3: Consumo do snapshot no módulo

**Files:** `lib/cnes-snapshot-store.js`, `test/cnes-snapshot-store.test.js`, `server.js`, `code_sandbox_light_git_fe61910d_1781185357/js/cnes-module.js`.

**Interfaces:** `readPublishedSnapshot(root, competence?) -> object|null`.

- [x] Escrever testes para competência atual, competência solicitada, manifesto inválido e legado.
- [x] Confirmar falhas antes da implementação.
- [x] Fazer a API consultar o manifesto; carregar competências reais no navegador e suprimir equipes/meses gerados como dados oficiais.
- [x] Rodar testes e comparar os fluxos CNES/BPA existentes.

### Task 4: Revisão final

**Files:** `docs/cnes-bacabal-comparativo.md`.

- [x] Registrar comparação da arquitetura com o fluxo atual e limites remanescentes.
- [x] Rodar testes completos relevantes e `git diff --check`.
- [x] Revisar o diff para garantir que nenhum arquivo bruto, credencial ou dado pessoal novo foi versionado.
