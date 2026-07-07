export type MediaType = 'image' | 'audio' | 'video';
export type MediaSource = 'conversation_upload' | 'project_asset' | 'external_url';
export type MediaAssetStatus =
  | 'uploaded'
  | 'processing'
  | 'processed'
  | 'failed'
  | 'indexed';
export type ProcessingMode = 'fast' | 'balanced' | 'full';
export type ImageType =
  | 'error_screenshot'
  | 'ui_screenshot'
  | 'diagram'
  | 'scanned_document'
  | 'chart_table'
  | 'photo'
  | 'unknown';

export interface MediaOcrBlockDto {
  text: string;
  bbox?: number[];
  confidence?: number;
}

export interface MediaLayoutBlockDto {
  type: string;
  content: string;
  bbox?: number[];
  confidence?: number;
}

export interface ImageProcessingResultDto {
  mediaId: string;
  type: 'image';
  imageType: ImageType;
  processingMode: ProcessingMode;
  metadata: {
    width: number;
    height: number;
    format: string;
    sizeBytes: number;
    sha256: string;
  };
  ocr: {
    provider: string;
    language: string[];
    fullText: string;
    blocks: MediaOcrBlockDto[];
  };
  layout: {
    provider: string;
    blocks: MediaLayoutBlockDto[];
  };
  vision: {
    provider: string;
    enabled: boolean;
    summary: string | null;
    objects: string[];
    uiElements: string[];
  };
  semantic: {
    summary: string;
    tags: string[];
    entities: string[];
    possibleIntent: string;
  };
  warnings: string[];
  thumbnailPath?: string;
}

export const IMAGE_MIME_PREFIX = 'image/';
export const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'tiff',
]);

export function isImageMime(mime?: string): boolean {
  return !!mime?.startsWith(IMAGE_MIME_PREFIX);
}

export function isImageFilename(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}
