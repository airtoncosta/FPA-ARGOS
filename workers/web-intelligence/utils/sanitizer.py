"""
Utilitário de sanitização de logs e credenciais para o subsistema ARGOS Web Intelligence.
Segue estritamente o Playbook de Arquitetura Enterprise do ARGOS (Princípio 2.4 - Defesa em Profundidade
e Sanitização de Dados em Repouso).
"""
import re

# Padrões conhecidos de chaves e tokens
PATTERNS = [
    (re.compile(r'AQ\.[a-zA-Z0-9_\-]{30,}'), '[REDACTED_GEMINI_KEY]'),
    (re.compile(r'AIzaSy[a-zA-Z0-9_\-]{30,}'), '[REDACTED_GOOGLE_KEY]'),
    (re.compile(r'sk-[a-zA-Z0-9]{32,}'), '[REDACTED_OPENAI_KEY]'),
    (re.compile(r'gsk_[a-zA-Z0-9]{30,}'), '[REDACTED_GROQ_KEY]'),
    (re.compile(r'(api[_-]?key\s*[:=]\s*["\']?)([^"\'\s]+)(["\']?)', re.IGNORECASE), r'\1[REDACTED]\3'),
    (re.compile(r'(authorization\s*[:=]\s*Bearer\s+)([^"\'\s]+)', re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r'(token\s*[:=]\s*["\']?)([^"\'\s]+)(["\']?)', re.IGNORECASE), r'\1[REDACTED]\3'),
]

def sanitize_text(text: str) -> str:
    """Substitui qualquer menção a chaves de API, senhas ou tokens por marcadores seguros."""
    if not isinstance(text, str):
        return text
    
    sanitized = text
    for pattern, replacement in PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized
