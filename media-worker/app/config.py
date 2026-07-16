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
THUMBNAIL_MAX_SIZE = int(os.getenv('MEDIA_THUMBNAIL_MAX_SIZE', '320'))
THUMBNAIL_QUALITY = int(os.getenv('MEDIA_THUMBNAIL_QUALITY', '85'))

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
VLM_AVAILABILITY_TIMEOUT_S = int(os.getenv('MEDIA_VLM_AVAILABILITY_TIMEOUT_S', '3'))
VLM_REQUEST_TIMEOUT_S = int(os.getenv('MEDIA_VLM_REQUEST_TIMEOUT_S', '120'))
VLM_PROMPT_LANGUAGE = os.getenv('MEDIA_VLM_PROMPT_LANGUAGE', 'pt')

# Retry (transient failures only — e.g. VLM network timeout)
VLM_MAX_RETRIES = int(os.getenv('MEDIA_VLM_MAX_RETRIES', '3'))
VLM_RETRY_BACKOFF_MS = int(os.getenv('MEDIA_VLM_RETRY_BACKOFF_MS', '400'))

# Semantic tag extraction
MAX_TAG_SOURCE_WORDS = int(os.getenv('MEDIA_MAX_TAG_SOURCE_WORDS', '30'))
MAX_TAGS = int(os.getenv('MEDIA_MAX_TAGS', '15'))

# Image-type detection keywords (externalized, parametrizável por idioma)
IMAGE_TYPE_KEYWORDS_PATH = os.getenv('MEDIA_IMAGE_TYPE_KEYWORDS_PATH', '')

ProcessingMode = Literal['fast', 'balanced', 'full']
