# test/test_router_cli.py
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from workers.web_intelligence.router import WebIntelligenceRouter

def test_router_targets_loading():
    router = WebIntelligenceRouter()
    targets = router.load_targets()
    print(f"Total de alvos carregados: {len(targets)}")
    assert len(targets) >= 40, f"Deveria ter ao menos 40 alvos configurados, encontrou {len(targets)}"

def test_router_dispatch_validation():
    router = WebIntelligenceRouter()
    # Teste sem params
    res = router.dispatch(mode="stealth")
    assert res.get("success") is False
    assert "exige o parâmetro --url" in res.get("error", "")

    # Teste modo desconhecido
    res_unknown = router.dispatch(mode="invalid_mode")
    assert res_unknown.get("success") is False
    assert "Modo desconhecido" in res_unknown.get("error", "")

if __name__ == "__main__":
    test_router_targets_loading()
    test_router_dispatch_validation()
    print("ALL ROUTER TESTS PASSED!")
