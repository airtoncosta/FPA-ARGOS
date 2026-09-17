"""
Logger estruturado do ARGOS Web Intelligence com sanitização automática de credenciais.
"""
import logging
import sys
from .sanitizer import sanitize_text

class SanitizedFormatter(logging.Formatter):
    def format(self, record):
        orig = super().format(record)
        return sanitize_text(orig)

def setup_logger(name: str = "argos.web_intelligence", level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(level)
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    formatter = SanitizedFormatter(
        fmt='[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.propagate = False
    return logger
