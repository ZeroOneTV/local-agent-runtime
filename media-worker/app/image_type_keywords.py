"""Loader das palavras-chave de classificação de tipo de imagem.

Mantém a heurística como *fallback* (quando o VLM está desabilitado), mas com
as keywords externalizadas em JSON e parametrizáveis por idioma — em vez de
strings fixas em inglês no código. Default embutido cobre PT + EN.
"""
import json
import os
from functools import lru_cache

from app.config import IMAGE_TYPE_KEYWORDS_PATH

_DEFAULT_PATH = os.path.join(os.path.dirname(__file__), 'data', 'image_type_keywords.json')

# Ordem de avaliação (prioridade). document_scan é decidido por tamanho de texto.
DETECTION_ORDER = [
    'error_screenshot',
    'ui_screenshot',
    'diagram',
    'code_screenshot',
    'chart',
]


@lru_cache(maxsize=1)
def load_keywords() -> dict[str, list[str]]:
    path = IMAGE_TYPE_KEYWORDS_PATH or _DEFAULT_PATH
    try:
        with open(path, 'r', encoding='utf-8') as f:
            raw = json.load(f)
    except Exception:
        # Fallback mínimo em inglês se o arquivo estiver ausente/corrompido
        return {
            'error_screenshot': ['error', 'exception', 'traceback', 'failed'],
            'ui_screenshot': ['button', 'menu', 'settings', 'dashboard', 'sidebar'],
            'diagram': ['diagram', 'flowchart', 'sequence', 'architecture'],
            'code_screenshot': ['def ', 'class ', 'import ', 'function '],
            'chart': ['chart', 'table', 'graph'],
        }

    return {
        key: [str(w).lower() for w in words]
        for key, words in raw.items()
        if not key.startswith('_') and isinstance(words, list)
    }
