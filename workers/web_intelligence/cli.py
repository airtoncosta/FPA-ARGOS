"""
Ponto de entrada CLI para o módulo ARGOS Web Intelligence & Radar.
Permite ao Agente de IA e a scripts automatizados disparar tarefas de coleta e inspeção.
"""
import sys
import os
import json
import argparse

# Configurar stdout e stderr para UTF-8 no Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Garantir que a raiz do projeto esteja no sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from workers.web_intelligence.router import WebIntelligenceRouter
from workers.web_intelligence.utils.sanitizer import sanitize_text

def main():
    parser = argparse.ArgumentParser(description="ARGOS Web Intelligence & Radar CLI")
    parser.add_argument("--mode", choices=["stealth", "reach", "smart", "radar-sweep"], default="reach",
                        help="Modo de operação: stealth (Scrapling), reach (Agent-Reach), smart (ScrapeGraphAI+Gemini) ou radar-sweep")
    parser.add_argument("--url", type=str, help="URL alvo para raspagem, leitura ou extração")
    parser.add_argument("--query", type=str, help="Termo de pesquisa para busca aberta")
    parser.add_argument("--prompt", type=str, help="Instrução semântica para extração com LLM no modo smart")
    parser.add_argument("--selector", type=str, help="Seletor CSS ou XPath opcional para o modo stealth")
    parser.add_argument("--limit", type=int, default=5, help="Limite de alvos a inspecionar no modo radar-sweep")
    parser.add_argument("--output", type=str, help="Arquivo de destino para salvar o JSON resultante")

    args = parser.parse_args()

    router = WebIntelligenceRouter()
    result = router.dispatch(
        mode=args.mode,
        url=args.url,
        query=args.query,
        prompt=args.prompt,
        selector=args.selector,
        limit=args.limit
    )

    result_json = json.dumps(result, ensure_ascii=False, indent=2)
    sanitized_output = sanitize_text(result_json)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(sanitized_output)

    # Imprimir no stdout em UTF-8 garantido
    print(sanitized_output)
    sys.exit(0 if result.get("success") else 1)

if __name__ == "__main__":
    main()
