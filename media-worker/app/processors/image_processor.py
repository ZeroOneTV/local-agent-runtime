import hashlib
import re
import time
from pathlib import Path

from PIL import Image

from app.config import (
    GENERATE_THUMBNAILS,
    MAX_BYTES,
    MAX_HEIGHT,
    MAX_WIDTH,
    OCR_LANGUAGES,
    STORAGE_ROOT,
    THUMBNAIL_FORMAT,
    ENABLE_TESSERACT_FALLBACK,
)
from app.providers.document.docling_provider import DoclingProvider
from app.providers.layout.paddle_structure_provider import PaddleStructureProvider
from app.providers.ocr.paddleocr_provider import PaddleOCRProvider
from app.providers.ocr.tesseract_provider import TesseractProvider
from app.providers.vision.ollama_vision_provider import OllamaVisionProvider
from app.schemas.image_result import (
    ImageMetadata,
    ImageProcessingResult,
    PerformanceInfo,
    ProcessCapabilities,
    ProcessRequest,
    ProviderInfo,
)


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def _detect_image_type(ocr_text: str, vision_hint: str | None = None) -> str:
    if vision_hint and vision_hint != 'unknown':
        return vision_hint
    lower = ocr_text.lower()
    if re.search(r'error|exception|traceback|failed', lower):
        return 'error_screenshot'
    if re.search(r'button|menu|settings|dashboard|ui|sidebar', lower):
        return 'ui_screenshot'
    if re.search(r'diagram|flowchart|sequence|architecture', lower):
        return 'diagram'
    if re.search(r'def |class |import |function ', lower):
        return 'code_screenshot'
    if len(ocr_text) > 400:
        return 'document_scan'
    if re.search(r'chart|table|graph', lower):
        return 'chart'
    if ocr_text.strip():
        return 'ui_screenshot'
    return 'photo'


def _extract_tags(text: str, extra: list[str] | None = None) -> list[str]:
    words = re.findall(r'[A-Za-z][A-Za-z0-9_-]{2,}', text)
    seen: set[str] = set()
    tags: list[str] = []
    for w in ([*(extra or [])] + words[:30]):
        k = w.lower()
        if k not in seen:
            seen.add(k)
            tags.append(k)
    return tags[:15]


def _build_cache_key(meta: ImageMetadata, mode: str, providers: ProviderInfo) -> str:
    raw = f"{meta.sha256}:{mode}:{providers.ocr}:{providers.layout}:{providers.document}:{providers.vision}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _run_ocr(image: Image.Image, mode: str) -> tuple[dict, list[str], int, str]:
    warnings: list[str] = []
    paddle = PaddleOCRProvider()
    tesseract = TesseractProvider()

    if mode != 'fast' and paddle.is_enabled() and paddle.is_available():
        result = paddle.process(image, mode, OCR_LANGUAGES)
        if result.data.get('fullText') or result.data.get('blocks'):
            warnings.extend(result.warnings)
            return result.data, warnings, result.duration_ms, result.provider

        warnings.append('PaddleOCR returned empty result; falling back to Tesseract')
        warnings.extend(result.warnings)

    if ENABLE_TESSERACT_FALLBACK or mode == 'fast':
        result = tesseract.process(image, mode, OCR_LANGUAGES)
        warnings.extend(result.warnings)
        return result.data, warnings, result.duration_ms, result.provider

    return {'fullText': '', 'blocks': [], 'language': OCR_LANGUAGES}, warnings, 0, 'disabled'


def process_image_request(req: ProcessRequest) -> ImageProcessingResult:
    started_total = time.time()
    path = Path(req.originalPath)
    if not path.is_file():
        raise FileNotFoundError(f'Image not found: {req.originalPath}')

    stat = path.stat()
    if stat.st_size > MAX_BYTES:
        raise ValueError(f'Image exceeds max size ({MAX_BYTES} bytes)')

    caps = req.requestedCapabilities or ProcessCapabilities()
    warnings: list[str] = []
    perf = PerformanceInfo()

    with Image.open(path) as img:
        img = img.convert('RGB')
        width, height = img.size
        if width > MAX_WIDTH or height > MAX_HEIGHT:
            raise ValueError(f'Image dimensions exceed limit ({MAX_WIDTH}x{MAX_HEIGHT})')

        fmt = (img.format or path.suffix.replace('.', '') or 'unknown').lower()
        sha = _sha256_file(path)
        meta = ImageMetadata(
            width=width,
            height=height,
            format=fmt,
            sizeBytes=stat.st_size,
            sha256=sha,
        )

        thumbnail_path = None
        if GENERATE_THUMBNAILS:
            thumb_dir = Path(STORAGE_ROOT) / 'images' / 'thumbnails' / req.projectId
            thumb_dir.mkdir(parents=True, exist_ok=True)
            ext = 'webp' if THUMBNAIL_FORMAT == 'webp' else 'jpg'
            thumb_path = thumb_dir / f'{req.mediaId}.{ext}'
            thumb = img.copy()
            thumb.thumbnail((320, 320))
            save_fmt = 'WEBP' if ext == 'webp' else 'JPEG'
            thumb.save(thumb_path, format=save_fmt, quality=85)
            thumbnail_path = str(thumb_path)

        ocr_data, ocr_warnings, perf.ocrMs, ocr_provider = _run_ocr(img, req.mode)
        warnings.extend(ocr_warnings)
        full_text = ocr_data.get('fullText', '')
        ocr_blocks = ocr_data.get('blocks', [])

        layout_provider_name = 'disabled'
        layout_blocks: list[dict] = []
        if caps.layout and req.mode != 'fast':
            layout_engine = PaddleStructureProvider()
            layout_result = layout_engine.process(img, ocr_blocks, req.mode)
            layout_blocks = layout_result.data.get('blocks', [])
            layout_provider_name = layout_result.provider
            perf.layoutMs = layout_result.duration_ms
            warnings.extend(layout_result.warnings)
        elif ocr_blocks:
            from app.providers.layout.paddle_structure_provider import HeuristicLayoutProvider
            layout_result = HeuristicLayoutProvider().process_from_ocr_blocks(ocr_blocks)
            layout_blocks = layout_result.data.get('blocks', [])
            layout_provider_name = layout_result.provider

        vision_data = {
            'provider': 'disabled',
            'enabled': False,
            'summary': None,
            'objects': [],
            'uiElements': [],
            'relationships': [],
        }
        vision_provider_name = 'disabled'
        vision_hint = None

        document_data = {'markdown': None, 'tables': []}
        document_provider_name = 'skipped'

        image_type = _detect_image_type(full_text)

        if caps.document and req.mode == 'full':
            doc_engine = DoclingProvider()
            if doc_engine.should_run(image_type, req.mode):
                doc_result = doc_engine.process(path, image_type, req.mode)
                document_data = doc_result.data
                document_provider_name = doc_result.provider
                perf.documentMs = doc_result.duration_ms
                warnings.extend(doc_result.warnings)

        enable_vlm = req.enableVlm or (caps.vision is True) or (caps.vision == 'auto')
        if enable_vlm:
            vlm = OllamaVisionProvider()
            force = caps.vision is True or req.enableVlm
            vlm_result = vlm.process(img, image_type, full_text, req.mode, force=force)
            perf.visionMs = vlm_result.duration_ms
            warnings.extend(vlm_result.warnings)
            vision_provider_name = vlm_result.provider
            if vlm_result.data.get('enabled'):
                vision_data = {
                    'provider': vlm_result.provider,
                    'enabled': True,
                    'summary': vlm_result.data.get('summary'),
                    'objects': vlm_result.data.get('objects', []),
                    'uiElements': vlm_result.data.get('uiElements', []),
                    'relationships': vlm_result.data.get('relationships', []),
                }
                vision_hint = vlm_result.data.get('imageTypeHint')
                image_type = _detect_image_type(full_text, vision_hint)

        tags = _extract_tags(full_text, vision_data.get('objects', []))
        entities = [t for t in tags if t[0].isupper()] if tags else []

        summary_parts = []
        if full_text:
            summary_parts.append(full_text[:240].strip())
        elif vision_data.get('summary'):
            summary_parts.append(str(vision_data['summary'])[:240])
        else:
            summary_parts.append(f'Image ({image_type}) without readable text.')

        if image_type == 'error_screenshot' and full_text:
            summary = 'Screenshot showing an error message. ' + summary_parts[0][:180]
        else:
            summary = summary_parts[0]

        providers = ProviderInfo(
            ocr=ocr_provider,
            layout=layout_provider_name,
            document=document_provider_name,
            vision=vision_provider_name,
        )

        provider_versions = {
            'ocr': ocr_provider,
            'layout': layout_provider_name,
            'document': document_provider_name,
            'vision': vision_provider_name,
        }

        perf.totalMs = int((time.time() - started_total) * 1000)

        return ImageProcessingResult(
            mediaId=req.mediaId,
            imageType=image_type,
            processingMode=req.mode,
            providers=providers,
            providerVersions=provider_versions,
            metadata=meta,
            ocr={
                'provider': ocr_provider,
                'language': ocr_data.get('language', OCR_LANGUAGES),
                'fullText': full_text,
                'blocks': ocr_blocks,
            },
            layout={'provider': layout_provider_name, 'blocks': layout_blocks},
            document=document_data,
            vision=vision_data,
            semantic={
                'summary': summary,
                'tags': tags,
                'entities': entities,
                'possibleIntent': 'debugging' if image_type == 'error_screenshot' else 'unknown',
            },
            warnings=warnings,
            performance=perf,
            thumbnailPath=thumbnail_path,
            cacheKey=_build_cache_key(meta, req.mode, providers),
        )
