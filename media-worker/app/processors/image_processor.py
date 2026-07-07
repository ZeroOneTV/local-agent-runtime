import hashlib
import re
from pathlib import Path

from PIL import Image

from app.config import GENERATE_THUMBNAILS, STORAGE_ROOT
from app.schemas.image_result import ImageProcessingResult, LayoutBlock, OcrBlock

try:
    import pytesseract
except ImportError:  # pragma: no cover
    pytesseract = None


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def _detect_image_type(ocr_text: str) -> str:
    lower = ocr_text.lower()
    if re.search(r'error|exception|traceback|failed', lower):
        return 'error_screenshot'
    if re.search(r'button|menu|settings|dashboard|ui', lower):
        return 'ui_screenshot'
    if re.search(r'diagram|flowchart|sequence', lower):
        return 'diagram'
    if len(ocr_text) > 400:
        return 'scanned_document'
    if re.search(r'chart|table|graph', lower):
        return 'chart_table'
    if ocr_text.strip():
        return 'ui_screenshot'
    return 'photo'


def _extract_tags(text: str) -> list[str]:
    words = re.findall(r'[A-Za-z][A-Za-z0-9_-]{2,}', text)
    seen: set[str] = set()
    tags: list[str] = []
    for w in words[:30]:
        k = w.lower()
        if k not in seen:
            seen.add(k)
            tags.append(k)
    return tags[:12]


def _run_ocr(image: Image.Image, mode: str) -> tuple[str, list[OcrBlock], str]:
    if pytesseract is None:
        return '', [], 'disabled'

    lang = 'por+eng' if mode != 'fast' else 'eng'
    try:
        data = pytesseract.image_to_data(image, lang=lang, output_type=pytesseract.Output.DICT)
        blocks: list[OcrBlock] = []
        lines: list[str] = []
        n = len(data.get('text', []))
        for i in range(n):
            text = (data['text'][i] or '').strip()
            conf = float(data['conf'][i]) if data['conf'][i] != '-1' else 0.0
            if not text or conf < 40:
                continue
            x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
            blocks.append(OcrBlock(text=text, bbox=[x, y, x + w, y + h], confidence=conf / 100))
            lines.append(text)
        full = '\n'.join(lines)
        return full, blocks, 'tesseract'
    except Exception:
        try:
            full = pytesseract.image_to_string(image)
            return full.strip(), [], 'tesseract'
        except Exception:
            return '', [], 'tesseract-failed'


def _layout_from_ocr(blocks: list[OcrBlock]) -> list[LayoutBlock]:
    layout: list[LayoutBlock] = []
    for b in blocks[:20]:
        block_type = 'error_message' if re.search(r'error|exception', b.text, re.I) else 'paragraph'
        layout.append(
            LayoutBlock(type=block_type, content=b.text, bbox=b.bbox, confidence=b.confidence)
        )
    return layout


def process_image(
    media_id: str,
    original_path: str,
    project_id: str,
    mode: str = 'balanced',
    enable_vlm: bool = False,
) -> ImageProcessingResult:
    path = Path(original_path)
    if not path.is_file():
        raise FileNotFoundError(f'Image not found: {original_path}')

    warnings: list[str] = []
    with Image.open(path) as img:
        img = img.convert('RGB')
        width, height = img.size
        fmt = (img.format or path.suffix.replace('.', '') or 'unknown').lower()
        sha = _sha256_file(path)

        thumbnail_path = None
        if GENERATE_THUMBNAILS:
            thumb_dir = Path(STORAGE_ROOT) / 'images' / 'thumbnails' / project_id
            thumb_dir.mkdir(parents=True, exist_ok=True)
            thumb_path = thumb_dir / f'{media_id}.jpg'
            thumb = img.copy()
            thumb.thumbnail((320, 320))
            thumb.save(thumb_path, format='JPEG', quality=85)
            thumbnail_path = str(thumb_path)

        full_text, ocr_blocks, ocr_provider = _run_ocr(img, mode)
        if not full_text:
            warnings.append('OCR returned no text; image may be photo-only or low contrast.')

        image_type = _detect_image_type(full_text)
        layout_blocks = _layout_from_ocr(ocr_blocks)
        tags = _extract_tags(full_text)

        summary = full_text[:240].strip() if full_text else f'Image ({image_type}) without readable text.'
        if image_type == 'error_screenshot' and full_text:
            summary = 'Screenshot showing an error message. ' + summary[:180]

        vision_enabled = enable_vlm
        if vision_enabled:
            warnings.append('VLM requested but not installed in this worker build.')

        return ImageProcessingResult(
            mediaId=media_id,
            imageType=image_type,
            processingMode=mode,
            metadata={
                'width': width,
                'height': height,
                'format': fmt,
                'sizeBytes': path.stat().st_size,
                'sha256': sha,
            },
            ocr={
                'provider': ocr_provider,
                'language': ['pt', 'en'] if mode != 'fast' else ['en'],
                'fullText': full_text,
                'blocks': [b.model_dump() for b in ocr_blocks],
            },
            layout={
                'provider': 'heuristic-ocr' if layout_blocks else 'disabled',
                'blocks': [b.model_dump() for b in layout_blocks],
            },
            vision={
                'provider': 'disabled',
                'enabled': False,
                'summary': None,
                'objects': [],
                'uiElements': [],
            },
            semantic={
                'summary': summary,
                'tags': tags,
                'entities': [t for t in tags if t[0].isupper()] if tags else [],
                'possibleIntent': 'debugging' if image_type == 'error_screenshot' else 'unknown',
            },
            warnings=warnings,
            thumbnailPath=thumbnail_path,
        )
