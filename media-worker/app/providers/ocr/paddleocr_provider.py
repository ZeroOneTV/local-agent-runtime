import time
from typing import TYPE_CHECKING

from app.config import ENABLE_PADDLEOCR, OCR_PRIMARY
from app.providers.base import BaseProvider, ProviderResult

if TYPE_CHECKING:
    from PIL import Image

# Mapeia código curto (OCR_LANGUAGES) → código que o PaddleOCR espera.
# PaddleOCR aceita UM idioma por instância; idiomas latinos compartilham modelo.
_PADDLE_LANG_MAP = {
    'pt': 'pt',
    'en': 'en',
    'es': 'es',
    'fr': 'fr',
    'de': 'german',
    'it': 'it',
    'nl': 'nl',
    'ru': 'ru',
    'ja': 'japan',
    'ko': 'korean',
    'zh': 'ch',
    'ch': 'ch',
    'ar': 'arabic',
}

# Cache de engines por idioma (evita instância global fixa em 'pt').
_engines: dict[str, object] = {}
_import_error: str | None = None


def _map_lang(code: str) -> str:
    return _PADDLE_LANG_MAP.get(code.lower(), code.lower())


def _load_paddle(lang_code: str):
    """Carrega (e cacheia) uma engine PaddleOCR para o idioma pedido."""
    global _import_error
    paddle_lang = _map_lang(lang_code)
    if paddle_lang in _engines:
        return _engines[paddle_lang]
    if _import_error is not None:
        return None
    try:
        from paddleocr import PaddleOCR

        engine = PaddleOCR(use_angle_cls=True, lang=paddle_lang, show_log=False)
        _engines[paddle_lang] = engine
        return engine
    except Exception as exc:
        _import_error = str(exc)
        return None


class PaddleOCRProvider(BaseProvider):
    name = 'paddleocr'

    def is_enabled(self) -> bool:
        return ENABLE_PADDLEOCR and OCR_PRIMARY == 'paddleocr'

    def is_available(self) -> bool:
        # Testa importação sem forçar um idioma específico do request.
        from app.config import OCR_LANGUAGES

        primary = OCR_LANGUAGES[0] if OCR_LANGUAGES else 'en'
        return _load_paddle(primary) is not None

    def get_version(self) -> str:
        return '2.9'

    def get_resource_cost(self) -> str:
        return 'medium'

    def process(self, image: 'Image.Image', mode: str, languages: list[str]) -> ProviderResult:
        started = time.time()
        warnings: list[str] = []

        primary_lang = languages[0] if languages else 'en'
        engine = _load_paddle(primary_lang)
        if engine is None:
            return ProviderResult(
                provider='unavailable',
                warnings=[f'PaddleOCR unavailable: {_import_error or "not installed"}'],
                data={'fullText': '', 'blocks': [], 'language': languages},
            )

        import numpy as np

        img_array = np.array(image.convert('RGB'))
        try:
            raw = engine.ocr(img_array, cls=True)
        except Exception as exc:
            warnings.append(f'PaddleOCR failed: {exc}')
            return ProviderResult(
                provider='failed',
                warnings=warnings,
                data={'fullText': '', 'blocks': [], 'language': languages},
                duration_ms=int((time.time() - started) * 1000),
            )

        blocks: list[dict] = []
        lines: list[str] = []
        if raw:
            for page in raw:
                if not page:
                    continue
                for item in page:
                    if not item or len(item) < 2:
                        continue
                    bbox_pts, (text, conf) = item[0], item[1]
                    text = (text or '').strip()
                    if not text:
                        continue
                    xs = [p[0] for p in bbox_pts]
                    ys = [p[1] for p in bbox_pts]
                    blocks.append({
                        'text': text,
                        'bbox': [min(xs), min(ys), max(xs), max(ys)],
                        'confidence': float(conf),
                    })
                    lines.append(text)

        return ProviderResult(
            provider=self.name,
            data={
                'fullText': '\n'.join(lines),
                'blocks': blocks,
                'language': languages,
                'engineLang': _map_lang(primary_lang),
            },
            warnings=warnings,
            duration_ms=int((time.time() - started) * 1000),
        )
