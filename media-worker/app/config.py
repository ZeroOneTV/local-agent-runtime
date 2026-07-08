import os
from typing import Literal

STORAGE_ROOT = os.getenv('STORAGE_ROOT', '/storage/media')

# Processing
DEFAULT_MODE = os.getenv('MEDIA_DEFAULT_PROCESSING_MODE', 'balanced')
PROCESSING_TIMEOUT_MS = int(os.getenv('MEDIA_PROCESSING_TIMEOUT_MS', '180000'))
MAX_WIDTH = int(os.getenv('MEDIA_MAX_IMAGE_WIDTH', '8000'))
MAX_HEIGHT = int(os.getenv('MEDIA_MAX_IMAGE_HEIGHT', '8000'))
MAX_BYTES = int(os.getenv('MEDIA_MAX_IMAGE_SIZE_MB', '25')) * 1024 * 1024
GENERATE_THUMBNAILS = os.getenv('MEDIA_GENERATE_THUMBNAILS', 'true').lower() != 'false'
THUMBNAIL_FORMAT = os.getenv('MEDIA_THUMBNAIL_FORMAT', 'webp')

# OCR
OCR_PRIMARY = os.getenv('MEDIA_OCR_PRIMARY', 'paddleocr')
ENABLE_PADDLEOCR = os.getenv('MEDIA_ENABLE_PADDLEOCR', 'true').lower() == 'true'
ENABLE_TESSERACT_FALLBACK = os.getenv('MEDIA_ENABLE_TESSERACT_FALLBACK', 'true').lower() == 'true'
OCR_LANGUAGES = [x.strip() for x in os.getenv('MEDIA_OCR_LANGUAGES', 'pt,en').split(',') if x.strip()]

# Layout
ENABLE_PP_STRUCTURE = os.getenv('MEDIA_ENABLE_PP_STRUCTURE', 'true').lower() == 'true'

# Document
ENABLE_DOCLING = os.getenv('MEDIA_ENABLE_DOCLING', 'true').lower() == 'true'
DOCLING_ONLY_FOR_DOCUMENTS = os.getenv('MEDIA_DOCLING_ONLY_FOR_DOCUMENTS', 'true').lower() == 'true'

# Vision
ENABLE_VLM = os.getenv('MEDIA_ENABLE_VLM', 'false').lower() == 'true'
VLM_PROVIDER = os.getenv('MEDIA_VLM_PROVIDER', 'ollama')
VLM_MODEL = os.getenv('MEDIA_VLM_MODEL', 'qwen2.5vl:7b')
VLM_BASE_URL = os.getenv('MEDIA_VLM_BASE_URL', 'http://host.docker.internal:11434')
VLM_MAX_IMAGE_SIZE = int(os.getenv('MEDIA_VLM_MAX_IMAGE_SIZE', '1280'))

ProcessingMode = Literal['fast', 'balanced', 'full']
