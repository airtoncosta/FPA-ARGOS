# test/test_dependencies.py
import sys

def test_imports():
    try:
        import scrapling
        print(f"[OK] scrapling imported: {scrapling.__file__}")
    except ImportError as e:
        print(f"[FAIL] scrapling import error: {e}")
        return False

    try:
        import scrapegraphai
        print(f"[OK] scrapegraphai imported: {scrapegraphai.__file__}")
    except ImportError as e:
        print(f"[FAIL] scrapegraphai import error: {e}")
        return False

    try:
        import google.generativeai
        print(f"[OK] google.generativeai imported")
    except ImportError as e:
        print(f"[FAIL] google.generativeai import error: {e}")
        return False

    return True

if __name__ == "__main__":
    success = test_imports()
    if not success:
        sys.exit(1)
    print("ALL DEPENDENCY TESTS PASSED")
    sys.exit(0)
