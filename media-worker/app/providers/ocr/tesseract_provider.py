import time
from typing import TYPE_CHECKING

from app.providers.base import BaseProvider, ProviderResult

if TYPE_CHECKING:
    from PIL import Image

try:
    import pytesseract
except ImportError:
    pytesseract = None

# Mapeia código curto (ISO 639-1) → pacote de idioma do Tesseract (ISO 639-2/T).
# Fallback: usa o próprio código se não houver mapeamento especial.
_TESSERACT_LANG_MAP = {
    'pt': 'por',
    'en': 'eng',
    'es': 'spa',
    'fr': 'fra',
    'de': 'deu',
    'it': 'ita',
    'nl': 'nld',
    'ru': 'rus',
    'ja': 'jpn',
    'ko': 'kor',
    'zh': 'chi_sim',
    'ar': 'ara',
}


def _resolve_tesseract_langs(languages: list[str]) -> str:
    """Converte a lista de OCR_LANGUAGES em string 'por+eng' para o Tesseract."""
    resolved: list[str] = []
    for code in languages:
        mapped = _TESSERACT_LANG_MAP.get(code.lower(), code.lower())
        if mapped not in resolved:
            resolved.append(mapped)
    return '+'.join(resolved) if resolved else 'eng'


class TesseractProvider(BaseProvider):
    name = 'tesseract'

    def is_enabled(self) -> bool:
        return True

    def is_available(self) -> bool:
        return pytesseract is not None

    def get_resource_cost(self) -> str:
        return 'low'

    def process(self, image: 'Image.Image', mode: str, languages: list[str]) -> ProviderResult:
        started = time.time()
        warnings: list[str] = []
        if not self.is_available():
            return ProviderResult(
                provider='disabled',
                warnings=['Tesseract not available'],
                data={'fullText': '', 'blocks': [], 'language': languages},
            )

        lang = _resolve_tesseract_langs(languages)
        if mode == 'fast':
            # Modo rápido: só o primeiro idioma configurado (default pt→por)
            primary = languages[0] if languages else 'pt'
            lang = _TESSERACT_LANG_MAP.get(primary.lower(), primary.lower())

        blocks: list[dict] = []
        full_text = ''
        try:
            data = pytesseract.image_to_data(image, lang=lang, output_type=pytesseract.Output.DICT)
            lines: list[str] = []
            n = len(data.get('text', []))
            for i in range(n):
                text = (data['text'][i] or '').strip()
                conf_raw = data['conf'][i]
                conf = float(conf_raw) if conf_raw != '-1' else 0.0
                if not text or conf < 40:
                    continue
                x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
                blocks.append({
                    'text': text,
                    'bbox': [x, y, x + w, y + h],
                    'confidence': conf / 100,
                })
                lines.append(text)
            full_text = '\n'.join(lines)
        except Exception as exc:
            warnings.append(f'Tesseract OCR failed: {exc}')
            try:
                full_text = pytesseract.image_to_string(image).strip()
            except Exception as exc2:
                warnings.append(f'Tesseract fallback failed: {exc2}')

        return ProviderResult(
            provider=self.name,
            data={'fullText': full_text, 'blocks': blocks, 'language': languages},
            warnings=warnings,
            duration_ms=int((time.time() - started) * 1000),
        )
