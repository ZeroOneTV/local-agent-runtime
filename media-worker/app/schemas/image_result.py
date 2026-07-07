import os
from pydantic import BaseModel, Field
from typing import Literal


class ProcessRequest(BaseModel):
    mediaId: str
    originalPath: str
    projectId: str
    mode: Literal['fast', 'balanced', 'full'] = 'balanced'
    enableVlm: bool = False


class OcrBlock(BaseModel):
    text: str
    bbox: list[float] | None = None
    confidence: float | None = None


class LayoutBlock(BaseModel):
    type: str
    content: str
    bbox: list[float] | None = None
    confidence: float | None = None


class ImageMetadata(BaseModel):
    width: int
    height: int
    format: str
    sizeBytes: int
    sha256: str


class ImageProcessingResult(BaseModel):
    mediaId: str
    type: Literal['image'] = 'image'
    imageType: str = 'unknown'
    processingMode: str = 'balanced'
    metadata: ImageMetadata
    ocr: dict
    layout: dict
    vision: dict
    semantic: dict
    warnings: list[str] = Field(default_factory=list)
    thumbnailPath: str | None = None
