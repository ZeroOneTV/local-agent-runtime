from fastapi import FastAPI, HTTPException

from app.processors.image_processor import process_image
from app.schemas.image_result import ImageProcessingResult, ProcessRequest

app = FastAPI(title='Media Worker', version='0.1.0')


@app.get('/health')
def health():
    return {'status': 'ok'}


@app.post('/process', response_model=ImageProcessingResult)
def process(req: ProcessRequest):
    try:
        return process_image(
            media_id=req.mediaId,
            original_path=req.originalPath,
            project_id=req.projectId,
            mode=req.mode,
            enable_vlm=req.enableVlm,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
