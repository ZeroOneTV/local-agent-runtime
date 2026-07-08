from pydantic import BaseModel, Field
from typing import Literal, Any


class ProcessCapabilities(BaseModel):
    ocr: bool = True
    layout: bool = True
    document: str | bool = 'auto'
    vision: str | bool = 'auto'


class ProcessRequest(BaseModel):
    mediaId: str
    originalPath: str
    projectId: str
    mode: Literal['fast', 'balanced', 'full'] = 'balanced'
    enableVlm: bool = False
    requestedCapabilities: ProcessCapabilities | None = None


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


class ProviderInfo(BaseModel):
    ocr: str = 'disabled'
    layout: str = 'disabled'
    document: str = 'disabled'
    vision: str = 'disabled'


class PerformanceInfo(BaseModel):
    totalMs: int = 0
    ocrMs: int = 0
    layoutMs: int = 0
    documentMs: int = 0
    visionMs: int = 0


class ImageProcessingResult(BaseModel):
    mediaId: str
    type: Literal['image'] = 'image'
    imageType: str = 'unknown'
    processingMode: str = 'balanced'
    providers: ProviderInfo = Field(default_factory=ProviderInfo)
    providerVersions: dict[str, str] = Field(default_factory=dict)
    metadata: ImageMetadata
    ocr: dict[str, Any]
    layout: dict[str, Any]
    document: dict[str, Any] = Field(default_factory=lambda: {'markdown': None, 'tables': []})
    vision: dict[str, Any]
    semantic: dict[str, Any]
    warnings: list[str] = Field(default_factory=list)
    performance: PerformanceInfo = Field(default_factory=PerformanceInfo)
    thumbnailPath: str | None = None
    cacheKey: str | None = None
