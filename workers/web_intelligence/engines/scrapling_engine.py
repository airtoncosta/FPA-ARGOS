"""
Scrapling Engine para raspagem ultra-rápida, stealth requests e bypass de anti-bot.
Utilizado para portais governamentais oficiais (Prefeitura, Diário Oficial, DATASUS, CNES).
"""
import time
from typing import Dict, Any, Optional, List
from bs4 import BeautifulSoup
from ..utils.logger import setup_logger

logger = setup_logger("argos.scrapling_engine")

class ScraplingEngine:
    """Motor de coleta rápida e stealth baseado no Scrapling com fallback gracioso."""

    def __init__(self, timeout: int = 30):
        self.timeout = timeout
        self._scrapling_available = False
        try:
            from scrapling import Fetcher, StealthyFetcher, Selector
            self.Fetcher = Fetcher
            self.StealthyFetcher = StealthyFetcher
            self.Selector = Selector
            self._scrapling_available = True
            logger.info("Scrapling nativo (Fetcher/StealthyFetcher/Selector) carregado com sucesso.")
        except Exception as e:
            logger.warning(f"Scrapling fetcher não inicializado diretamente ({e}), usando fallback inteligente.")

    def fetch_url(self, url: str, selector: Optional[str] = None) -> Dict[str, Any]:
        """Faz a coleta de uma página com técnicas de evasão e parsing estruturado."""
        logger.info(f"ScraplingEngine requisitando URL: {url}")
        start_time = time.time()

        # Tentativa 1: Scrapling Fetcher nativo
        if self._scrapling_available:
            try:
                page = self.Fetcher.get(url, timeout=self.timeout)
                html = page.text if hasattr(page, "text") else str(page)
                status = getattr(page, "status", 200)

                # Se houver seletor css ou xpath
                elements = []
                if selector:
                    try:
                        matches = page.css(selector)
                        elements = [m.text for m in matches if hasattr(m, "text")]
                    except Exception:
                        pass

                return {
                    "success": True,
                    "engine": "scrapling_native",
                    "url": url,
                    "status_code": status,
                    "duration_seconds": round(time.time() - start_time, 2),
                    "matched_elements": elements,
                    "html": html[:60000],
                    "text_sample": page.text[:1000] if hasattr(page, "text") else ""
                }
            except Exception as e:
                logger.warning(f"Scrapling Fetcher nativo falhou ({e}), acionando fallback HTTP resiliente.")

        # Tentativa 2: Fallback com requests + BeautifulSoup e headers de navegador
        try:
            import requests
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            }
            resp = requests.get(url, headers=headers, timeout=self.timeout)
            soup = BeautifulSoup(resp.content, "html.parser")

            elements = []
            if selector:
                for el in soup.select(selector):
                    elements.append(el.get_text(strip=True))

            # Remover scripts e estilos para extrair texto limpo
            for script in soup(["script", "style", "nav", "footer"]):
                script.extract()
            clean_text = soup.get_text(separator=" ", strip=True)

            return {
                "success": resp.status_code == 200,
                "engine": "scrapling_resilient_fallback",
                "url": url,
                "status_code": resp.status_code,
                "duration_seconds": round(time.time() - start_time, 2),
                "matched_elements": elements,
                "text_sample": clean_text[:2000],
                "html": resp.text[:60000]
            }
        except Exception as err:
            logger.error(f"Erro fatal no ScraplingEngine: {str(err)}")
            return {
                "success": False,
                "engine": "scrapling",
                "url": url,
                "error": str(err),
                "duration_seconds": round(time.time() - start_time, 2)
            }
