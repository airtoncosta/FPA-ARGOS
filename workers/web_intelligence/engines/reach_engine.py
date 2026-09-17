"""
Agent-Reach Engine para busca aberta, leitura markdown limpa e inspeção social.
Zero dependência de chaves de API pagas.
Combina Jina Reader (leitura de URLs/perfis em Markdown) e DuckDuckGo Search (busca sem chave).
"""
import requests
import json
import urllib.parse
from typing import Dict, Any, Optional, List
from bs4 import BeautifulSoup
from ..utils.logger import setup_logger

logger = setup_logger("argos.reach_engine")

class ReachEngine:
    """Motor de alcance de dados web públicos e redes sociais."""

    JINA_READER_BASE = "https://r.jina.ai/"

    def __init__(self, timeout: int = 30):
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ARGOS-Radar/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        })

    def read_url(self, url: str) -> Dict[str, Any]:
        """Lê uma página web ou perfil público e retorna Markdown limpo via Jina Reader."""
        target_url = f"{self.JINA_READER_BASE}{url}"
        logger.info(f"ReachEngine lendo URL via Jina Reader: {url}")
        try:
            resp = self.session.get(target_url, timeout=self.timeout)
            if resp.status_code == 200 and len(resp.text.strip()) > 0:
                content = resp.text
                return {
                    "success": True,
                    "engine": "reach_jina_reader",
                    "mode": "read",
                    "url": url,
                    "status_code": resp.status_code,
                    "content": content[:50000],
                    "length": len(content)
                }
        except Exception as err:
            logger.warning(f"Jina Reader falhou para {url}: {err}. Tentando leitura direta...")

        # Fallback para GET direto
        try:
            direct_resp = self.session.get(url, timeout=self.timeout)
            soup = BeautifulSoup(direct_resp.content, "html.parser")
            for tag in soup(["script", "style", "svg", "noscript"]):
                tag.extract()
            text_content = soup.get_text(separator="\n", strip=True)

            return {
                "success": direct_resp.status_code == 200,
                "engine": "reach_direct_reader",
                "mode": "read",
                "url": url,
                "status_code": direct_resp.status_code,
                "content": text_content[:50000],
                "length": len(text_content)
            }
        except Exception as e:
            logger.error(f"Erro fatal ao ler URL no ReachEngine: {str(e)}")
            return {
                "success": False,
                "engine": "reach",
                "url": url,
                "error": str(e)
            }

    def search(self, query: str, max_results: int = 5) -> Dict[str, Any]:
        """Pesquisa na web aberta sem chave de API usando DuckDuckGo."""
        logger.info(f"ReachEngine pesquisando query: {query}")
        
        # Tentativa 1: Biblioteca ddgs nativa
        try:
            from ddgs import DDGS
            with DDGS() as ddgs:
                raw_results = list(ddgs.text(query, max_results=max_results))
                if raw_results:
                    return {
                        "success": True,
                        "engine": "reach_ddgs",
                        "mode": "search",
                        "query": query,
                        "count": len(raw_results),
                        "results": raw_results
                    }
        except Exception as e:
            logger.warning(f"ddgs nativo falhou ({e}), tentando busca web fallback...")

        # Tentativa 2: Fallback DuckDuckGo HTML
        try:
            url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
            resp = self.session.post(
                "https://html.duckduckgo.com/html/",
                data={"q": query},
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
                timeout=self.timeout
            )
            soup = BeautifulSoup(resp.content, "html.parser")
            items = []
            for r in soup.select(".result__body")[:max_results]:
                title_el = r.select_one(".result__title a")
                snippet_el = r.select_one(".result__snippet")
                if title_el:
                    items.append({
                        "title": title_el.get_text(strip=True),
                        "href": title_el.get("href", ""),
                        "body": snippet_el.get_text(strip=True) if snippet_el else ""
                    })

            return {
                "success": True,
                "engine": "reach_html_search",
                "mode": "search",
                "query": query,
                "count": len(items),
                "results": items
            }
        except Exception as err:
            logger.error(f"Erro na busca ReachEngine: {str(err)}")
            return {
                "success": False,
                "engine": "reach",
                "query": query,
                "error": str(err)
            }

    def search_or_read(self, query_or_url: str) -> Dict[str, Any]:
        """Roteia automaticamente: se for URL lê o conteúdo; caso contrário pesquisa."""
        if query_or_url.startswith("http://") or query_or_url.startswith("https://"):
            return self.read_url(query_or_url)
        return self.search(query_or_url)
