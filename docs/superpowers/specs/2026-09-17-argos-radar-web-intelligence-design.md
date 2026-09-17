# Especificação Técnica: Motor ARGOS Radar & Blog (Scrapling + Agent-Reach + ScrapeGraphAI)

**Projeto:** FPA-ARGOS  
**Módulo:** ARGOS Blog & Radar Engine  
**Documento Base:** `docs/ARGOS_BLOG_RADAR.md`  
**Data:** 17 de Setembro de 2026  
**Status:** Aprovado em Brainstorming / Pronto para Planejamento  

---

## 1. Visão Geral e Propósito

O objetivo deste subsistema é materializar o **ARGOS Radar Engine** e a geração de conteúdo para o **ARGOS Blog**, integrando as três ferramentas de inteligência web solicitadas:
1. **Scrapling:** Motor de coleta de alto desempenho e stealth (bypass de proteções anti-bot/Cloudflare, extração em alta velocidade de portais oficiais, Diário Oficial de Bacabal, DATASUS e CNES).
2. **Agent-Reach:** Motor de busca aberta e inspeção de redes sociais públicas (Instagram, Twitter/X, YouTube, Facebook, Jina Reader, Exa) para monitoramento de perfis municipais e governamentais sem APIs pagas.
3. **ScrapeGraphAI + Google Gemini (Free Tier):** Motor de interpretação semântica e extração estruturada de documentos, portarias, atos municipais e publicações para geração de relatórios e artigos editoriais no ARGOS Blog.

O sistema atende a dois consumidores principais:
- **O Agente de IA do Antigravity/ARGOS:** Capaz de invocar o subsistema diretamente via CLI em qualquer tarefa de auditoria, cruzamento ou verificação web.
- **O Backend Node.js do ARGOS (`server.js`):** Capaz de orquestrar rotinas agendadas (diárias às 05:00 ou sob demanda) de forma não-bloqueante (Playbook Enterprise).

---

## 2. Escopo de Monitoramento e Fontes

### 2.1. Fontes Governamentais Oficiais (Scrapling + ScrapeGraphAI)
- **Prefeitura Municipal de Bacabal:** `https://www.bacabal.ma.gov.br/` (notícias, avisos, secretarias).
- **Diário Oficial de Bacabal:** `https://www.bacabal.ma.gov.br/diario` (edições em PDF/HTML, decretos, portarias de saúde, contratos e licitações).
- **DATASUS / SIA-SUS / CNES / SIGTAP / FNS:** Portais de disseminação, tabelas de habilitações, tetos MAC e repasses.

### 2.2. Radar de Redes Sociais e Perfis Públicos Oficiais (Agent-Reach)

Para garantir cobertura profunda do ecossistema de saúde pública e da gestão municipal, o **ARGOS Radar** monitora um catálogo categorizado de **45+ perfis e canais oficiais** (armazenados em `profiles/radar_targets.json`), divididos em 4 esferas estratégicas:

#### A. Esfera Municipal de Bacabal/MA e Região (12 perfis)
1. **Prefeitura Municipal de Bacabal** — Instagram oficial (`@prefeituradebacabaloficial`)
2. **Prefeitura Municipal de Bacabal** — Facebook institucional (`/prefeituradebacabal`)
3. **Prefeitura Municipal de Bacabal** — Canal oficial YouTube (pronunciamentos, eventos)
4. **Secretaria Municipal de Saúde (SEMUS Bacabal)** — Instagram oficial
5. **Secretaria Municipal de Saúde (SEMUS Bacabal)** — Facebook / avisos públicos
6. **Prefeito Municipal de Bacabal** — Perfil público institucional (Instagram)
7. **Secretário(a) Municipal de Saúde de Bacabal** — Perfil público institucional (Instagram)
8. **Câmara Municipal de Bacabal** — YouTube (sessões da saúde, audiências do SUS e votações)
9. **Câmara Municipal de Bacabal** — Instagram institucional (`@camarabacabal`)
10. **Hospital Geral de Bacabal / Laura Vasconcelos** — Noticiário e canal de comunicação oficial
11. **UPA e SAMU 192 Regional Bacabal** — Comunicados e alertas de atendimento
12. **Conselho Municipal de Saúde de Bacabal (CMS)** — Publicações e convocações

#### B. Esfera Estadual do Maranhão (11 perfis)
13. **Governo do Estado do Maranhão** — Instagram oficial (`@governodoma`)
14. **Governo do Estado do Maranhão** — Twitter/X oficial (`@governodoma`)
15. **Secretaria de Estado da Saúde do Maranhão (SES-MA)** — Instagram (`@saudema`)
16. **Secretaria de Estado da Saúde do Maranhão (SES-MA)** — Twitter/X (`@saudema`)
17. **Secretaria de Estado da Saúde do Maranhão (SES-MA)** — YouTube oficial (campanhas e transmissões)
18. **Secretário(a) de Estado da Saúde do MA** — Perfil institucional público
19. **COSEMS-MA (Conselho de Secretarias Municipais de Saúde do Maranhão)** — Instagram (`@cosemsma`)
20. **COSEMS-MA** — Canal oficial / YouTube (capacitações de faturamento e notas técnicas)
21. **FAMEM (Federação dos Municípios do Maranhão)** — Instagram (`@famem_ma`)
22. **Policlínica Regional de Bacabal** — Comunicados do Governo do Estado sobre serviços ofertados
23. **Hospital Macrorregional de Santa Inês / Bacabal** — Informes e fluxos de regulação

#### C. Esfera Federal e Órgãos Reguladores do SUS (14 perfis)
24. **Ministério da Saúde do Brasil** — Instagram oficial (`@minsaude`)
25. **Ministério da Saúde do Brasil** — Twitter/X oficial (`@minsaude`)
26. **Ministério da Saúde do Brasil** — YouTube oficial (`/minsaudebr` - informes de gestão e portarias)
27. **Ministério da Saúde do Brasil** — Facebook oficial (`/minsaude`)
28. **Ministra da Saúde** — Perfil institucional público (Twitter/X e Instagram)
29. **DATASUS (Departamento de Informática do SUS)** — Twitter/X e comunicados oficiais
30. **FNS (Fundo Nacional de Saúde)** — Twitter/X e Instagram (`@fusonacionaldesaude` - repasses e emendas)
31. **FNS (Fundo Nacional de Saúde)** — Canal YouTube oficial (tutoriais de repasse e contas públicas)
32. **ANVISA** — Instagram oficial (`@anvisaoficial`)
33. **ANVISA** — Twitter/X oficial (`@anvisa_oficial` - alertas sanitários e resoluções RDC)
34. **ANS (Agência Nacional de Saúde Suplementar)** — Instagram e Twitter/X (`@ans_reguladora`)
35. **FIOCRUZ (Fundação Oswaldo Cruz)** — Instagram e Twitter/X (`@fiocruz`)
36. **Instituto Butantan** — Twitter/X e Instagram (`@butantanoficial`)
37. **EBSERH (Empresa Brasileira de Serviços Hospitalares)** — YouTube e Instagram

#### D. Entidades Nacionais de Controle, Fiscalização e Gestão SUS (10 perfis)
38. **CONASS (Conselho Nacional de Secretários de Saúde)** — Instagram (`@conassoficial`)
39. **CONASS** — Twitter/X (`@conassoficial` - boletins epidemiológicos e deliberações CIT)
40. **CONASEMS (Conselho Nacional de Secretarias Municipais de Saúde)** — Instagram (`@conasems`)
41. **CONASEMS** — YouTube oficial (Canal Mais CONASEMS - orientações SIA/SIH e faturamento)
42. **CNS (Conselho Nacional de Saúde)** — Twitter/X e Instagram (`@conselhonacionaldesaude`)
43. **TCE-MA (Tribunal de Contas do Estado do Maranhão)** — Instagram (`@tce_ma` - fiscalizações da saúde)
44. **TCE-MA** — YouTube (sessões plenárias de contas municipais de saúde)
45. **MP-MA (Ministério Público do Maranhão)** — Instagram (`@mpmaoficial` - atuações promotorias da saúde)
46. **CGU (Controladoria-Geral da União)** — Twitter/X (`@cguonline` - auditorias do SUS e transferências)
47. **TCU (Tribunal de Contas da União)** — Twitter/X e YouTube (acórdãos de repasses FNS/MAC)

- **Mecanismo Operacional:** O `Agent-Reach` roda inspeções programadas ou pontuais via `Jina Reader`, `OpenCLI`, buscas públicas indexadas e `yt-dlp` (para extração automática de transcrições de vídeos e sessões), tudo sem custos de API ou riscos de bloqueio.
- **Parametrização Flexível:** O arquivo `workers/web-intelligence/profiles/radar_targets.json` permite ativar/desativar perfis ou incluir novos alvos a qualquer momento sem mexer no código.

---

## 3. Arquitetura do Pacote `workers/web-intelligence`

O subsistema reside em `workers/web-intelligence/` e opera no ambiente virtual Python existente (`.venv` Python 3.12.14):

```
workers/web-intelligence/
├── requirements.txt
├── .env.example
├── __init__.py
├── cli.py                         # Ponto de entrada CLI unificado
├── router.py                      # WebIntelligenceRouter (orquestrador principal)
├── engines/
│   ├── __init__.py
│   ├── scrapling_engine.py        # Coleta rápida, stealth requests, parsing HTML
│   ├── reach_engine.py            # Inspeção social e busca web aberta (Agent-Reach / Jina)
│   └── scrapegraph_engine.py      # Extração e síntese estruturada com Gemini
├── profiles/
│   └── radar_targets.json         # Cadastro de URLs e perfis monitorados (Bacabal, SUS)
├── storage/
│   ├── raw/                       # Armazenamento bruto de evidências (snapshots/PDFs)
│   └── parsed/                    # Dados estruturados prontos para o Blog/Radar
└── utils/
    ├── __init__.py
    ├── sanitizer.py               # Sanitização estrita de credenciais e logs
    └── logger.py                  # Logs estruturados com Correlation ID
```

---

## 4. Componentes e Fluxo de Execução

### 4.1. WebIntelligenceRouter (`router.py`)
Encapsula a lógica de decisão:
- **`route(task_type, target, **kwargs)`**:
  - Se `task_type == "official_portal"`: Invoca `ScraplingEngine` com `StealthyFetcher`.
  - Se `task_type == "social_profile"` ou `"public_search"`: Invoca `ReachEngine`.
  - Se `task_type == "extract_structured"` ou `"generate_editorial"`: Invoca `ScrapegraphEngine` alimentado com o modelo `gemini-1.5-flash` / `gemini-2.0-flash`.
  - Se não houver chave de API Gemini no ambiente, degrada automaticamente para `ScraplingEngine` + `ReachEngine` gerando texto em Markdown puro.

### 4.2. CLI para o Agente e Linha de Comando (`cli.py`)
Permite chamadas diretas como:
```bash
# Monitorar o Diário Oficial de Bacabal
.\.venv\Scripts\python -m workers.web_intelligence --mode=stealth --url "https://www.bacabal.ma.gov.br/diario"

# Inspecionar perfis sociais e buscas sobre Bacabal / Saúde
.\.venv\Scripts\python -m workers.web_intelligence --mode=reach --query "Prefeitura de Bacabal Secretaria de Saude"

# Extrair dados de Portarias em JSON usando Gemini
.\.venv\Scripts\python -m workers.web_intelligence --mode=smart --url "https://..." --prompt "Extraia valores, CNES e atos de saúde"

# Executar rotina completa do Radar Argos (Bacabal + SUS)
.\.venv\Scripts\python -m workers.web_intelligence --mode=radar-sweep
```

### 4.3. Ponte com Node.js (`lib/web-intelligence-bridge.js`)
- Executa o worker em segundo plano utilizando `node:child_process` (`spawn`).
- Não bloqueia o Event Loop do `server.js`.
- Fornece respostas assíncronas no padrão `HTTP 202 Accepted` para operações longas ou retorno JSON direto para consultas curtas.

---

## 5. Integração com o ARGOS Blog & Radar

Seguindo o pipeline de 12 etapas de `docs/ARGOS_BLOG_RADAR.md`:
1. **Descobrir & Coletar:** O motor busca novidades nas fontes oficiais e redes cadastradas.
2. **Armazenar Evidência:** Salva o HTML/snapshot bruto em `storage/raw/` para conformidade e rastreabilidade (Princípio 5.4 - Evidência).
3. **Comparar:** Detecta se houve alteração em relação à versão anterior (hash/diferença de conteúdo).
4. **Classificar & Interpretar:** Identifica palavras-chave prioritárias de Bacabal (SEMUS, SCAAR, Teto MAC, CNES, Diário Oficial).
5. **Gerar Conteúdo Editorial:** Gera a postagem estruturada para o ARGOS Blog:
   - Título informativo.
   - Resumo executivo.
   - Fonte original rastreável.
   - Nível de impacto (Informativo, Atenção, Crítico).
   - Tags e data.

---

## 6. Segurança e Conformidade (Playbook Enterprise)

1. **Gestão de Chaves:** A chave do Google Gemini fica isolada no arquivo `.env` da raiz e/ou em `workers/web-intelligence/.env`. O `.env` já está no `.gitignore`.
2. **Sanitização:** Qualquer log gerado passa pelo `sanitizer.py`, substituindo tokens, cookies e chaves de API por `[REDACTED]`.
3. **Timeouts:** Todas as requisições externas possuem timeout máximo de 30 a 60 segundos com retry exponencial.
4. **Armazenamento Seguro:** Dados coletados de redes sociais e portais públicos respeitam estritamente a coleta de dados de acesso público.

---

## 7. Plano de Verificação

### 7.1. Testes Automatizados (`test/test_web_intelligence.py`)
- Validação de importação e integridade dos 3 motores (`scrapling`, `agent-reach`, `scrapegraphai`).
- Teste unitário de sanitização de logs e credenciais.
- Teste de fallback quando sem chave de API externa.
- Teste de execução pontual do `cli.py` via subprocesso.

### 7.2. Validação Funcional Pontual
- Teste de leitura de página pública de saúde.
- Teste de extração semântica com o Gemini Free Tier usando a chave configurada.
- Teste de chamada do bridge Node.js (`lib/web-intelligence-bridge.js`).
