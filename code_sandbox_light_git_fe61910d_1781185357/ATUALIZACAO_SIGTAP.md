# Guia de Atualização de Competências do SIGTAP no FPA ARGOS

## 1. Como Funciona a Atualização de Competências?

A Tabela Unificada do SUS (SIGTAP) é atualizada todo mês pelo Ministério da Saúde e disponibilizada no FTP público do DATASUS.

O módulo SIGTAP integrado ao **FPA ARGOS** foi desenvolvido para consultar a API REST pública (`https://sigtap-api.vercel.app/api/v1/sigtap`), o que traz as seguintes vantagens:

### Atualização Automática (Zero Esforço)
1. Quando uma nova competência mensal é liberada pelo Ministério da Saúde e importada na API (ex: `202608`, `202609`, etc.), ela aparece **automaticamente** no seletor de competências no topo da tela do SIGTAP.
2. O sistema seleciona automaticamente a competência mais recente com `vigente: true`.
3. Não é necessário alterar nenhum código, recompilar ou reiniciar o FPA ARGOS.

---

## 2. O Que o Módulo SIGTAP Oferece?

* **Busca Completa de Procedimentos**: Pesquisa por código (10 dígitos) ou nome do procedimento.
* **Filtros Estruturais**: Por Grupo, Subgrupo, Forma de Organização e Modalidade de Atendimento.
* **Ficha Detalhada do Procedimento**:
  * Valores ambulatoriais (SA) e hospitalares (SH e SP);
  * CBOs autorizados a faturar o procedimento;
  * CIDs compatíveis como diagnóstico principal ou secundário;
  * Habilitações e incentivos exigidos;
  * Serviços e Classificações;
  * Regras Condicionadas e Incrementos;
  * Mapeamento TUSS e Renases.
* **Consultas Reversas**:
  * Dado um CID, descubra quais procedimentos são autorizados;
  * Dado um CBO (médico, enfermeiro, psicólogo, etc.), descubra quais procedimentos ele pode faturar.
* **Dicionários e Relatórios**: Consulta completa às tabelas de domínio do SUS.
* **Versionamento**: Permite navegar em qualquer competência histórica cadastrada.

---

## 3. Automação Própria via GitHub Actions (Modelo RenatoKR / DATASUS)

Para garantir **100% de autonomia e independência de terceiros**, o FPA ARGOS conta com um robô mirror próprio configurado no GitHub Actions:

* **Arquivo de Workflow:** `.github/workflows/sync-sigtap-datasus.yml`
* **Script de Processamento:** `scripts/processar_sigtap_datasus.js`
* **Como Funciona:**
  1. **Execução Automática Diária:** Todo dia às 06h00 (horário de Brasília), o GitHub Actions acorda uma máquina virtual no GitHub.
  2. **Verificação no FTP do DATASUS:** Conecta diretamente em `ftp://anonymous:@ftp.datasus.gov.br/dissemin/publicos/SIASUS/200801_/Tabelas/`.
  3. **Identificação de Novidades:** Compara o arquivo `TabelaUnificada_*.zip` mais recente com o arquivo gravado em `sigtap_data/sigtap_metadata.json`.
  4. **Extração e Conversão:** Se o Ministério da Saúde publicou nova competência, ele baixa o ZIP, extrai os arquivos (`tb_procedimento.txt`, `rl_procedimento_ocupacao.txt`, `rl_procedimento_cid.txt`), compila e comita automaticamente no repositório.
* **Execução Manual (Quando Desejar):**
  - No seu repositório no GitHub, acesse a aba **Actions**;
  - Clique em **"Sincronizar SIGTAP DATASUS"**;
  - Clique no botão **"Run workflow"**.
