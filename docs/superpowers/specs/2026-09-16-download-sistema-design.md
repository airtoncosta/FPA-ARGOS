# Especificação Técnica — Módulo "Download Sistema" (SIA/BPA & BDSIA) com Motor Autônomo DATASUS

- **Data:** 16 de Setembro de 2026
- **Status:** Validado
- **Escopo:** Novo módulo de sistema no FPA-ARGOS para catálogo, sincronização automática e distribuição local dos instaladores do SIA/SUS (BPA e BDSIA).
- **Alvos:**
  - Backend: `lib/siasus-sync-service.js` e rotas no `server.js`
  - Frontend: `code_sandbox_light_git_fe61910d_1781185357/js/download-sistema-module.js`
  - Interface: `code_sandbox_light_git_fe61910d_1781185357/index.html` (sidebar e nova seção)
  - Armazenamento: `code_sandbox_light_git_fe61910d_1781185357/siasus_data/`

---

## 1. Contexto e Objetivos

O **FPA-ARGOS** é a plataforma de inteligência e regulação ambulatorial do SUS. Os operadores, faturistas e auditores frequentemente necessitam atualizar as tabelas do **BDSIA** (Base de Dados do SIA) e o software instalador do **BPA** (Boletim de Produção Ambulatorial).

Hoje, esse processo é manual ou dependente de buscas no site confuso do DATASUS. O repositório público `RenatoKR/SIASUS` serviu como prova de conceito de espelhamento via GitHub Actions. Contudo, para tornar o FPA-ARGOS **100% autônomo, profissional e independente**, este módulo introduz:
1. Um **motor nativo Node.js** que varre diretamente os repositórios oficiais do DATASUS (`ftp.datasus.gov.br`).
2. **Armazenamento e cache local** dos últimos 6 meses de BDSIA e da versão vigente de BPA no próprio servidor ARGOS, permitindo downloads instantâneos em rede local sem lentidão externa.
3. **Limpeza e rotação automática** de versões antigas (mantendo apenas as 6 versões mais recentes, preservando o disco).
4. **Fallback resiliente** caso o servidor oficial do Ministério da Saúde esteja temporariamente instável.
5. **Interface moderna e elegante**, alinhada ao Design System Dark Glassmorphism do ARGOS, com badges de competência, status de conectividade e botão de sincronização manual.

---

## 2. Arquitetura do Motor de Sincronização (`lib/siasus-sync-service.js`)

### 2.1 Parser Inteligente de Versões
O motor reconhece os seguintes padrões de arquivo oficiais do DATASUS:
- **BPA:** `BPAMAG(\d{4})\.exe` (ex: `BPAMAG0500.exe` $\rightarrow$ Versão 05.00)
- **BDSIA:** `BDSIA(\d{4})(\d{2})([a-z]?)\.exe`
  - Exemplo `BDSIA202608a.exe` $\rightarrow$ Ano: 2026, Mês: 08 ("Agosto/2026"), Revisão: "rev. a"
  - Exemplo `BDSIA202607b.exe` $\rightarrow$ Ano: 2026, Mês: 07 ("Julho/2026"), Revisão: "rev. b"

### 2.2 Estratégia de Varredura e Resiliência
1. **Fonte Primária (DATASUS Oficial):**
   - Varre `http://ftp.datasus.gov.br/siasus/BPA/` e `http://ftp.datasus.gov.br/siasus/SIA/`.
   - Extrai nomes de arquivos, datas e tamanhos reportados pelo servidor HTTP do DATASUS.
2. **Fonte Secundária (Espelho Público de Contingência):**
   - Caso o DATASUS apresente timeout (>10s) ou erro de conexão 5xx, o motor consulta o espelho de contingência para obter a lista atualizada e os binários.
3. **Armazenamento Local:**
   - Salva em `code_sandbox_light_git_fe61910d_1781185357/siasus_data/downloads/`.
   - Grava o índice estruturado em `siasus_data/siasus_catalogo.json`.
4. **Política de Retenção e Rotação:**
   - Para BDSIA: ordena todas as versões de forma decrescente por ano, mês e letra de revisão.
   - Preserva exatamente as **6 versões mais recentes**.
   - Qualquer arquivo `.exe` de BDSIA em disco que não pertença a essas 6 versões é removido automaticamente (`fs.unlinkSync`).
   - Para BPA: preserva a versão mais recente em disco.

### 2.3 Agendamento Automático
- Executa uma verificação inicial 5 segundos após o boot do servidor.
- Agenda nova verificação automática a cada 6 horas (`21600000 ms`), de forma segura em background sem bloquear o event loop.

---

## 3. Endpoints REST da API (`server.js`)

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/siasus/versoes` | Retorna o catálogo JSON com as versões disponíveis de BPA e BDSIA, status de cache local e data da última sincronização. |
| `POST` | `/api/siasus/sincronizar` | Dispara a verificação imediata no DATASUS em segundo plano e baixa novidades. Retorna `202 Accepted`. |
| `GET` | `/api/siasus/download/:arquivo` | Faz o streaming do arquivo `.exe` local diretamente para o navegador do usuário com alta velocidade. |

---

## 4. Frontend & Design System ARGOS

### 4.1 Navegação Lateral (`index.html`)
- Novo item de navegação:
  ```html
  <li class="nav-item" data-section="download-sistema">
      <i class="fas fa-cloud-download-alt"></i><span>Download Sistema</span>
  </li>
  ```
- Inserido antes de "Arquivos Importados".

### 4.2 Nova Seção Visual (`section-download-sistema`)
- **Cabeçalho de Seção:**
  - Título: **Sistemas & Atualizações DATASUS (SIA/SUS)**
  - Subtítulo explicativo e badges de status:
    - Badge de Conectividade DATASUS: `Online` (verde) ou `Em Cache Local` (azul)
    - Badge de Última Atualização: Data e hora formatada
- **Cards de Indicadores (KPIs no topo):**
  1. **Versão Vigente BPA:** Ícone de caixa, nome da versão (ex: `BPAMAG 05.00`), tamanho (`7.5 MB`).
  2. **Competência Ativa BDSIA:** Ícone de calendário/banco, competência (ex: `Agosto/2026 (rev. a)`), tamanho (`9.4 MB`).
  3. **Total em Cache Local:** Quantidade de instaladores retidos e tamanho somado em disco.
  4. **Status do Servidor:** Indicador de sincronização automática ativa.
- **Barra de Controle:**
  - Botão **"🔄 Sincronizar com DATASUS Agora"** com animação de spinner durante execução.
  - Filtro / busca rápida de competência.
- **Tabelas Estilizadas (ARGOS Glassmorphism):**
  - **Tabela 1: Arquivos BPA (Boletim de Produção Ambulatorial)**
    - Colunas: Ícone/Arquivo, Tipo, Tamanho, Status no Servidor, Ação (Botão "Baixar Instalador .exe").
  - **Tabela 2: Arquivos BDSIA (Base de Dados SIA / Tabelas Nacionais)**
    - Colunas: Arquivo, Competência (Pill com cor de destaque), Revisão, Tamanho, Status no Servidor, Ação (Botão "Baixar .exe").

### 4.3 Módulo JavaScript (`download-sistema-module.js`)
- `DownloadSistemaModule.init()`: Carrega dados via `/api/siasus/versoes`.
- `DownloadSistemaModule.sincronizar()`: Dispara a rota `/api/siasus/sincronizar`, exibe toast e atualiza a tabela dinamicamente.
- `DownloadSistemaModule.baixarArquivo(nome)`: Inicia o download seguro via `/api/siasus/download/${nome}`.

---

## 5. Plano de Testes e Validação
- Teste unitário do parser de nomes (`BPAMAG0500.exe`, `BDSIA202608a.exe`, `BDSIA202607b.exe`).
- Teste da rotação de 6 versões (garantindo que versões excedentes sejam descartadas).
- Teste dos endpoints `/api/siasus/versoes` e `/api/siasus/sincronizar`.
- Teste da navegação na interface e download direto no navegador.
