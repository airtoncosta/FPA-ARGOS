# test/test_engines.py
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from workers.web_intelligence.engines.scrapling_engine import ScraplingEngine
from workers.web_intelligence.engines.reach_engine import ReachEngine
from workers.web_intelligence.engines.scrapegraph_engine import ScrapegraphEngine

def test_engine_interfaces():
    scrapling = ScraplingEngine()
    reach = ReachEngine()
    scrapegraph = ScrapegraphEngine()

    assert hasattr(scrapling, "fetch_url"), "ScraplingEngine deve ter fetch_url"
    assert hasattr(reach, "read_url"), "ReachEngine deve ter read_url"
    assert hasattr(reach, "search"), "ReachEngine deve ter search"
    assert hasattr(reach, "search_or_read"), "ReachEngine deve ter search_or_read"
    assert hasattr(scrapegraph, "extract"), "ScrapegraphEngine deve ter extract"
    print("ALL ENGINE INTERFACE TESTS PASSED!")

if __name__ == "__main__":
    test_engine_interfaces()
