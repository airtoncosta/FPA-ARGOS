"""
ScrapeGraphAI Engine para extração semântica estruturada guiada por LLM (Google Gemini Free Tier).
Transforma páginas complexas em JSON estruturado para o ARGOS Blog e Radar.
"""
import os
import json
import requests
from typing import Dict, Any, Optional
from dotenv import load_dotenv
from ..utils.logger import setup_logger

logger = setup_logger("argos.scrapegraph_engine")

class ScrapegraphEngine:
    """Motor de extração semântica com ScrapeGraphAI e Google Gemini com rotação de modelos."""

    CANDIDATE_MODELS = [
        "gemini-2.5-flash",
        "gemini-flash-latest",
        "gemini-2.5-flash-lite"
    ]

    def __init__(self, api_key: Optional[str] = None):
        load_dotenv()
        # Carregar do .env local ou raiz
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
            if os.path.exists(env_path):
                load_dotenv(env_path)
                self.api_key = os.getenv("GEMINI_API_KEY")

        if self.api_key:
            logger.info("ScrapegraphEngine inicializado com chave Gemini detectada.")
        else:
            logger.warning("ScrapegraphEngine inicializado sem chave Gemini. Modo smart usará fallback.")

    def extract(self, url_or_text: str, prompt: str, schema: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Extrai dados estruturados usando LLM (Gemini) com rotação automática em caso de alta demanda."""
        logger.info(f"Iniciando extração semântica para: {prompt[:60]}...")

        if not self.api_key:
            return {
                "success": False,
                "engine": "scrapegraph_ai",
                "error": "Chave GEMINI_API_KEY não configurada no ambiente.",
                "fallback_available": True
            }

        # Obter o conteúdo texto via Jina Reader ou requisição direta se for URL
        content_text = url_or_text
        if url_or_text.startswith("http://") or url_or_text.startswith("https://"):
            try:
                jina_url = f"https://r.jina.ai/{url_or_text}"
                resp = requests.get(jina_url, timeout=20)
                if resp.status_code == 200 and len(resp.text.strip()) > 0:
                    content_text = resp.text[:25000]
                else:
                    resp2 = requests.get(url_or_text, timeout=20)
                    content_text = resp2.text[:25000]
            except Exception as e:
                logger.warning(f"Falha ao pré-carregar URL para extração LLM: {e}")

        # Extração via Google GenAI SDK tentando os modelos candidatos
        last_error = None
        for model_name in self.CANDIDATE_MODELS:
            try:
                from google import genai
                client = genai.Client(api_key=self.api_key)

                full_prompt = (
                    f"Você é o assistente de inteligência e auditoria do ARGOS.\n"
                    f"Tarefa: {prompt}\n"
                    f"Instrução estrita: Retorne APENAS um objeto JSON válido, sem cercas markdown como ```json.\n\n"
                    f"CONTEÚDO DA PÁGINA/DOCUMENTO:\n{content_text}"
                )

                response = client.models.generate_content(
                    model=model_name,
                    contents=full_prompt,
                )

                raw_text = response.text.strip()
                if raw_text.startswith("```json"):
                    raw_text = raw_text[7:]
                if raw_text.startswith("```"):
                    raw_text = raw_text[3:]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3]
                raw_text = raw_text.strip()

                parsed_json = json.loads(raw_text)
                logger.info(f"Extração concluída com sucesso usando {model_name}!")
                return {
                    "success": True,
                    "engine": f"gemini_{model_name}",
                    "extracted_data": parsed_json
                }
            except Exception as err:
                last_error = err
                logger.warning(f"Modelo {model_name} indisponível ({err}). Tentando próximo modelo...")
                continue

        logger.error(f"Todos os modelos Gemini falharam. Último erro: {last_error}")
        return {
            "success": False,
            "engine": "scrapegraph_gemini",
            "error": str(last_error),
            "fallback_available": True
        }
