# test/test_sanitizer.py
import sys
import os

# Adicionar raiz ao path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from workers.web_intelligence.utils.sanitizer import sanitize_text

def test_sanitize_gemini_key():
    raw = "Usando key AQ.Ab8FAKEKEY_MOCK_TEST_1234567890abcdef_XYZ no request"
    cleaned = sanitize_text(raw)
    assert "AQ.Ab8FAKEKEY" not in cleaned, "Chave Gemini nao foi mascarada!"
    assert "[REDACTED_GEMINI_KEY]" in cleaned, "Marcador de mascara nao encontrado!"

def test_sanitize_authorization_header():
    raw = "Authorization: Bearer mySecretToken1234567890abcdef"
    cleaned = sanitize_text(raw)
    assert "mySecretToken" not in cleaned
    assert "[REDACTED]" in cleaned

def test_non_string_input():
    assert sanitize_text(123) == 123
    assert sanitize_text(None) is None

if __name__ == "__main__":
    test_sanitize_gemini_key()
    test_sanitize_authorization_header()
    test_non_string_input()
    print("ALL SANITIZER TESTS PASSED!")
    sys.exit(0)
