import time
from typing import TYPE_CHECKING

from app.config import ENABLE_PADDLEOCR, OCR_PRIMARY
from app.providers.base import BaseProvider, ProviderResult

if TYPE_CHECKING:
    from PIL import Image

_paddle_ocr = None
_paddle_import_error: str | None = None


def _load_paddle():
    global _paddle_ocr, _paddle_import_error
    if _paddle_ocr is not None or _paddle_import_error is not None:
        return _paddle_ocr
    try:
        from paddleocr import PaddleOCR

        langs = ['pt', 'en']
        _paddle_ocr = PaddleOCR(use_angle_cls=True, lang='pt', show_log=False)
        return _paddle_ocr
    except Exception as exc:
        _paddle_import_error = str(exc)
        return None


class PaddleOCRProvider(BaseProvider):
    name = 'paddleocr'

    def is_enabled(self) -> bool:
        return ENABLE_PADDLEOCR and OCR_PRIMARY == 'paddleocr'

    def is_available(self) -> bool:
        return _load_paddle() is not None

    def get_version(self) -> str:
        return '2.9'

    def get_resource_cost(self) -> str:
        return 'medium'

    def process(self, image: 'Image.Image', mode: str, languages: list[str]) -> ProviderResult:
        started = time.time()
        warnings: list[str] = []
        engine = _load_paddle()
        if engine is None:
            return ProviderResult(
                provider='unavailable',
                warnings=[f'PaddleOCR unavailable: {_paddle_import_error or "not installed"}'],
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
            data={'fullText': '\n'.join(lines), 'blocks': blocks, 'language': languages},
            warnings=warnings,
            duration_ms=int((time.time() - started) * 1000),
        )
