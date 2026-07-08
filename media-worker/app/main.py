from fastapi import FastAPI, HTTPException

from app.processors.image_processor import process_image_request
from app.schemas.image_result import ImageProcessingResult, ProcessRequest

app = FastAPI(title='Media Worker', version='0.2.0')


@app.get('/health')
def health():
    from app.providers.ocr.paddleocr_provider import PaddleOCRProvider
    from app.providers.document.docling_provider import DoclingProvider
    from app.providers.vision.ollama_vision_provider import OllamaVisionProvider
    from app.config import ENABLE_VLM, ENABLE_PADDLEOCR, ENABLE_DOCLING, ENABLE_PP_STRUCTURE

    return {
        'status': 'ok',
        'providers': {
            'paddleocr': {
                'enabled': ENABLE_PADDLEOCR,
                'available': PaddleOCRProvider().is_available(),
            },
            'ppStructure': {'enabled': ENABLE_PP_STRUCTURE},
            'docling': {
                'enabled': ENABLE_DOCLING,
                'available': DoclingProvider().is_available(),
            },
            'vlm': {
                'enabled': ENABLE_VLM,
                'available': OllamaVisionProvider().is_available() if ENABLE_VLM else False,
            },
        },
    }


@app.post('/process', response_model=ImageProcessingResult)
def process(req: ProcessRequest):
    try:
        return process_image_request(req)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
