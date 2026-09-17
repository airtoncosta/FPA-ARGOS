# Motor ARGOS Radar & Blog (Scrapling + Agent-Reach + ScrapeGraphAI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o motor de inteligência e coleta web do **ARGOS Radar & Blog** no pacote `workers/web-intelligence/`, integrando Scrapling (stealth/alta velocidade), Agent-Reach (redes sociais/busca aberta) e ScrapeGraphAI (extração estruturada com Google Gemini), expondo interface CLI para o Agente e bridge assíncrono para o Node.js.

**Architecture:** Módulo Python corporativo isolado em `workers/web-intelligence/` rodando no `.venv` (Python 3.12.14). Um orquestrador central (`WebIntelligenceRouter`) seleciona o motor adequado com fallback gracioso, consulta um catálogo de 47+ perfis em `profiles/radar_targets.json`, salva evidências brutas em `storage/raw/` e integra-se ao backend Node.js via `lib/web-intelligence-bridge.js` sem bloquear o Event Loop.

**Tech Stack:** Python 3.12, Scrapling, Agent-Reach / Jina Reader, ScrapeGraphAI, Google Gemini API, Node.js (v18+ / v20+), Vanilla JS.

**Spec:** `docs/superpowers/specs/2026-09-17-argos-radar-web-intelligence-design.md`

## Global Constraints

- Ambiente Python: utilizar estritamente o `.venv` existente (`.\.venv\Scripts\python.exe`).
- Node.js: seguir o Playbook Enterprise com zero bloqueio de Event Loop (`child_process.spawn` não-bloqueante).
- Segurança: chaves de API nunca devem ser expostas em logs; utilizar `utils/sanitizer.py` para mascarar `[REDACTED]`.
- Resiliência: timeouts estritos de 30 a 60 segundos por requisição com fallback automático caso a LLM esteja sem cota ou indisponível.

---

### Task 1: Instalação e Configuração do Ambiente (`.venv`, `requirements.txt`, `.env`)

**Files:**
- Create: `workers/web-intelligence/requirements.txt`
- Create: `workers/web-intelligence/.env`
- Modify: `.env` (na raiz do projeto, preservando chaves existentes)
- Test: `test/test_dependencies.py`

**Interfaces:**
- Consumes: `.venv` Python 3.12.14 e chave Gemini fornecida pelo usuário.
- Produces: Ambiente virtual com `scrapling`, `scrapegraphai`, `google-genai`, `beautifulsoup4`, `lxml` prontos para importação.

- [ ] **Step 1: Criar o teste de validação de importação das dependências**

```python
# test/test_dependencies.py
def test_imports():
    import scrapling
    import scrapegraphai
    import google.generativeai
    assert scrapling is not None
    assert scrapegraphai is not None
    assert google.generativeai is not None
```

- [ ] **Step 2: Executar o teste para verificar falha inicial**

Run: `.\.venv\Scripts\python -m pytest test/test_dependencies.py` (ou `python test/test_dependencies.py`)
Expected: FAIL (módulos ainda não instalados)

- [ ] **Step 3: Criar `workers/web-intelligence/requirements.txt` e instalar dependências no `.venv`**

Criar arquivo com:
```text
scrapling>=0.3.0
scrapegraphai>=1.0.0
google-generativeai>=0.8.0
playwright>=1.40.0
beautifulsoup4>=4.12.0
lxml>=5.0.0
python-dotenv>=1.0.0
requests>=2.31.0
```
Instalar via: `.\.venv\Scripts\pip install -r workers/web-intelligence/requirements.txt`
E configurar `.env` com `GEMINI_API_KEY=sua_chave_gemini_aqui`.

- [ ] **Step 4: Executar o teste para verificar sucesso**

Run: `.\.venv\Scripts\python test/test_dependencies.py`
Expected: PASS com código de saída 0.

---

### Task 2: Catálogo de Alvos do Radar (`radar_targets.json`) e Utilitários de Segurança e Log

**Files:**
- Create: `workers/web-intelligence/profiles/radar_targets.json`
- Create: `workers/web-intelligence/utils/sanitizer.py`
- Create: `workers/web-intelligence/utils/logger.py`
- Test: `test/test_sanitizer.py`

**Interfaces:**
- Consumes: Dicionários de alvos e strings de texto/logs com possíveis chaves.
- Produces: `sanitize_text(str) -> str`, `get_targets(category=None) -> list[dict]`, `setup_logger(name) -> Logger`.

- [ ] **Step 1: Criar o teste de unidade para sanitização**

```python
# test/test_sanitizer.py
from workers.web_intelligence.utils.sanitizer import sanitize_text

def test_sanitize_gemini_key():
    raw = "Usando key AQ.Ab8FAKEKEY_MOCK_TEST_1234567890abcdef_XYZ no request"
    cleaned = sanitize_text(raw)
    assert "AQ.Ab8FAKEKEY" not in cleaned
    assert "[REDACTED_GEMINI_KEY]" in cleaned
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `.\.venv\Scripts\python test/test_sanitizer.py`
Expected: FAIL (módulo inexistente)

- [ ] **Step 3: Implementar `sanitizer.py`, `logger.py` e `radar_targets.json`**

Implementar máscara regex em `sanitizer.py` para chaves API e tokens.
Cadastrar os 47 perfis oficiais em `radar_targets.json` com campos: `id`, `name`, `sphere` (municipal/estadual/federal/controle), `platform` (instagram/twitter/youtube/portal), `url_or_handle`, `active`.

- [ ] **Step 4: Re-executar teste e verificar sucesso**

Run: `.\.venv\Scripts\python test/test_sanitizer.py`
Expected: PASS.

---

### Task 3: Motores de Coleta (`scrapling_engine.py`, `reach_engine.py`, `scrapegraph_engine.py`)

**Files:**
- Create: `workers/web-intelligence/engines/scrapling_engine.py`
- Create: `workers/web-intelligence/engines/reach_engine.py`
- Create: `workers/web-intelligence/engines/scrapegraph_engine.py`
- Test: `test/test_engines.py`

**Interfaces:**
- Consumes: URLs, queries de busca e prompts de extração.
- Produces:
  - `ScraplingEngine.fetch_url(url, selector=None) -> dict(html=..., text=..., status=...)`
  - `ReachEngine.search_or_read(query_or_url) -> dict(markdown=..., source=...)`
  - `ScrapeGraphEngine.extract(url, prompt, schema=None) -> dict(data=..., success=...)`

- [ ] **Step 1: Escrever teste de unidade para os três motores**

```python
# test/test_engines.py
from workers.web_intelligence.engines.scrapling_engine import ScraplingEngine
from workers.web_intelligence.engines.reach_engine import ReachEngine
from workers.web_intelligence.engines.scrapegraph_engine import ScrapegraphEngine

def test_engine_interfaces():
    assert hasattr(ScraplingEngine, 'fetch_url')
    assert hasattr(ReachEngine, 'search_or_read')
    assert hasattr(ScrapegraphEngine, 'extract')
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `.\.venv\Scripts\python test/test_engines.py`
Expected: FAIL.

- [ ] **Step 3: Implementar os 3 motores**

- `scrapling_engine.py`: Usa `Fetcher` / `Adaptor` do Scrapling com headers rotacionados e timeout de 30s.
- `reach_engine.py`: Usa Jina Reader (`https://r.jina.ai/{url}`) para extração de markdown limpo de artigos e páginas públicas, e integração com YouTube/buscas abertas.
- `scrapegraph_engine.py`: Configura `SmartScraperGraph` com Gemini (`gemini-1.5-flash` / `gemini-2.0-flash`) lendo `GEMINI_API_KEY` do ambiente, retornando JSON estrito validado.

- [ ] **Step 4: Executar testes para verificar sucesso**

Run: `.\.venv\Scripts\python test/test_engines.py`
Expected: PASS.

---

### Task 4: Roteador Central (`router.py`) e Ponto de Entrada CLI (`cli.py`)

**Files:**
- Create: `workers/web-intelligence/router.py`
- Create: `workers/web-intelligence/cli.py`
- Create: `workers/web-intelligence/__init__.py`
- Test: `test/test_router_cli.py`

**Interfaces:**
- Consumes: CLI args `--mode`, `--url`, `--query`, `--prompt`, `--target-id`, `--sweep`.
- Produces: JSON padronizado no `stdout` (`{ "success": true, "mode": "...", "data": ..., "timestamp": "..." }`).

- [ ] **Step 1: Escrever teste de chamada do roteador e CLI**

```python
# test/test_router_cli.py
from workers.web_intelligence.router import WebIntelligenceRouter

def test_router_fallback():
    router = WebIntelligenceRouter()
    res = router.dispatch(mode="reach", query="https://example.com")
    assert res.get("success") is True
    assert "data" in res
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `.\.venv\Scripts\python test/test_router_cli.py`
Expected: FAIL.

- [ ] **Step 3: Implementar `router.py` e `cli.py`**

- `router.py`: Despacha para o motor correto com base no modo (`stealth`, `reach`, `smart`, `radar-sweep`). Implementa fallback gracioso para Markdown se o modo `smart` falhar por cota ou ausência de chave.
- `cli.py`: Fornece interface via `argparse` e imprime JSON sanitizado.
- `radar-sweep`: Itera sobre perfis ativos em `profiles/radar_targets.json` e gera snapshots em `storage/raw/` e sumários no padrão ARGOS Blog.

- [ ] **Step 4: Re-executar teste e verificar sucesso**

Run: `.\.venv\Scripts\python test/test_router_cli.py`
Expected: PASS.

---

### Task 5: Ponte Assíncrona Node.js (`lib/web-intelligence-bridge.js`) & Testes Ponta a Ponta

**Files:**
- Create: `lib/web-intelligence-bridge.js`
- Test: `test/test-bridge.js`

**Interfaces:**
- Consumes: `bridge.execute({ mode, url, query, prompt }) -> Promise<object>`
- Produces: Execução de subprocesso Python não-bloqueante no padrão Enterprise do ARGOS.

- [ ] **Step 1: Escrever teste do bridge em Node.js**

```javascript
// test/test-bridge.js
const assert = require('node:assert');
const { WebIntelligenceBridge } = require('../lib/web-intelligence-bridge');

async function run() {
    const bridge = new WebIntelligenceBridge();
    const result = await bridge.execute({ mode: 'reach', query: 'https://example.com' });
    assert(result.success === true, 'Bridge deve retornar success: true');
    console.log('Bridge test passed!');
}
run().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `node test/test-bridge.js`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `lib/web-intelligence-bridge.js`**

Implementar classe `WebIntelligenceBridge` com `child_process.spawn`, apontando para `.\.venv\Scripts\python.exe` e `workers.web_intelligence.cli`, tratando buffers com timeout de 45 segundos.

- [ ] **Step 4: Executar teste para verificar sucesso**

Run: `node test/test-bridge.js`
Expected: PASS com código 0.
