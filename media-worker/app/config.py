import os

STORAGE_ROOT = os.getenv('STORAGE_ROOT', '/storage/media')
ENABLE_VLM = os.getenv('MEDIA_ENABLE_VLM', 'false').lower() == 'true'
ENABLE_PADDLEOCR = os.getenv('MEDIA_ENABLE_PADDLEOCR', 'false').lower() == 'true'
MAX_WIDTH = int(os.getenv('MEDIA_MAX_IMAGE_WIDTH', '8000'))
MAX_HEIGHT = int(os.getenv('MEDIA_MAX_IMAGE_HEIGHT', '8000'))
GENERATE_THUMBNAILS = os.getenv('MEDIA_GENERATE_THUMBNAILS', 'true').lower() != 'false'
