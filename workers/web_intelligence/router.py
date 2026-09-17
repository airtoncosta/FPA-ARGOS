"""
WebIntelligenceRouter: Orquestrador central do motor ARGOS Web Intelligence & Radar.
Coordena Scrapling, Agent-Reach e ScrapeGraphAI com tolerância a falhas e persistência de evidências.
"""
import os
import json
import time
from typing import Dict, Any, Optional, List
from datetime import datetime
from .engines.scrapling_engine import ScraplingEngine
from .engines.reach_engine import ReachEngine
from .engines.scrapegraph_engine import ScrapegraphEngine
from .utils.logger import setup_logger
from .utils.sanitizer import sanitize_text

logger = setup_logger("argos.router")

class WebIntelligenceRouter:
    """Roteador inteligente para consultas web e varredura do Radar ARGOS."""

    def __init__(self):
        self.scrapling = ScraplingEngine()
        self.reach = ReachEngine()
        self.scrapegraph = ScrapegraphEngine()
        self.base_dir = os.path.dirname(__file__)
        self.targets_file = os.path.join(self.base_dir, "profiles", "radar_targets.json")
        self.raw_dir = os.path.join(self.base_dir, "storage", "raw")
        self.parsed_dir = os.path.join(self.base_dir, "storage", "parsed")

        os.makedirs(self.raw_dir, exist_ok=True)
        os.makedirs(self.parsed_dir, exist_ok=True)

    def dispatch(
        self,
        mode: str = "reach",
        url: Optional[str] = None,
        query: Optional[str] = None,
        prompt: Optional[str] = None,
        selector: Optional[str] = None,
        limit: int = 5
    ) -> Dict[str, Any]:
        """Despacha a requisição para o motor correspondente."""
        logger.info(f"Roteando requisição: mode={mode}, url={url}, query={query}")
        timestamp = datetime.now().isoformat()

        if mode == "stealth":
            if not url:
                return {"success": False, "error": "Modo 'stealth' exige o parâmetro --url"}
            res = self.scrapling.fetch_url(url, selector=selector)
            res["mode"] = "stealth"
            res["timestamp"] = timestamp
            return res

        elif mode == "reach":
            target = url or query
            if not target:
                return {"success": False, "error": "Modo 'reach' exige --url ou --query"}
            res = self.reach.search_or_read(target)
            res["mode"] = "reach"
            res["timestamp"] = timestamp
            return res

        elif mode == "smart":
            target = url or query
            if not target or not prompt:
                return {"success": False, "error": "Modo 'smart' exige --url (ou --query) e --prompt"}
            res = self.scrapegraph.extract(target, prompt=prompt)
            # Fallback gracioso se a LLM falhou
            if not res.get("success") and res.get("fallback_available"):
                logger.warning("Modo smart degradando para modo reach...")
                fallback_res = self.reach.search_or_read(target)
                fallback_res["smart_fallback_reason"] = res.get("error")
                return fallback_res
            res["mode"] = "smart"
            res["timestamp"] = timestamp
            return res

        elif mode == "radar-sweep":
            return self.run_radar_sweep(limit=limit)

        else:
            return {"success": False, "error": f"Modo desconhecido: '{mode}'. Use stealth, reach, smart ou radar-sweep."}

    def load_targets(self) -> List[Dict[str, Any]]:
        """Carrega a lista de alvos configurados."""
        if not os.path.exists(self.targets_file):
            return []
        try:
            with open(self.targets_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            flat_targets = []
            for sphere in data.get("spheres", []):
                sphere_name = sphere.get("name")
                for target in sphere.get("targets", []):
                    target["sphere_name"] = sphere_name
                    flat_targets.append(target)
            return flat_targets
        except Exception as e:
            logger.error(f"Erro ao carregar radar_targets.json: {e}")
            return []

    def run_radar_sweep(self, limit: int = 5, sphere_filter: Optional[str] = None) -> Dict[str, Any]:
        """Executa uma varredura automatizada nos alvos do Radar ARGOS."""
        targets = self.load_targets()
        if sphere_filter:
            targets = [t for t in targets if t.get("sphere") == sphere_filter or sphere_filter in t.get("sphere_name", "")]

        active_targets = [t for t in targets if t.get("active", True)][:limit]
        logger.info(f"Iniciando varredura do Radar ARGOS em {len(active_targets)} alvos...")

        results = []
        sweep_time = datetime.now().strftime("%Y%m%d_%H%M%S")

        for target in active_targets:
            target_id = target.get("id")
            url = target.get("url")
            platform = target.get("platform")
            logger.info(f"Inspecionando alvo: {target.get('name')} ({url})")

            # Coleta via Reach ou Scrapling
            if platform in ["instagram", "twitter", "youtube", "facebook"]:
                scrape_res = self.reach.read_url(url)
            else:
                scrape_res = self.scrapling.fetch_url(url)

            # Salvar evidência bruta
            raw_filename = f"raw_{sweep_time}_{target_id}.json"
            raw_path = os.path.join(self.raw_dir, raw_filename)
            try:
                with open(raw_path, "w", encoding="utf-8") as f:
                    json.dump(scrape_res, f, ensure_ascii=False, indent=2)
            except Exception as err:
                logger.error(f"Erro ao salvar snapshot em {raw_path}: {err}")

            summary_item = {
                "target_id": target_id,
                "name": target.get("name"),
                "sphere": target.get("sphere_name"),
                "platform": platform,
                "url": url,
                "collected_at": datetime.now().isoformat(),
                "success": scrape_res.get("success", False),
                "status_code": scrape_res.get("status_code"),
                "raw_file": raw_filename,
                "preview": (scrape_res.get("content") or scrape_res.get("text_sample") or "")[:250]
            }
            results.append(summary_item)

        # Salvar resultado do sweep
        sweep_report_file = os.path.join(self.parsed_dir, f"sweep_{sweep_time}.json")
        report = {
            "sweep_id": f"sweep_{sweep_time}",
            "generated_at": datetime.now().isoformat(),
            "total_targets_swept": len(results),
            "results": results
        }
        with open(sweep_report_file, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        logger.info(f"Varredura concluída. Relatório salvo em: {sweep_report_file}")
        return {
            "success": True,
            "mode": "radar-sweep",
            "report_file": sweep_report_file,
            "total_swept": len(results),
            "items": results
        }
