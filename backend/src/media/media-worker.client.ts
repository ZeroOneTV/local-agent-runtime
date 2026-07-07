import { Injectable, Logger } from '@nestjs/common';
import { MediaConfigService } from './media.config';
import { ImageProcessingResultDto, ProcessingMode } from './media.types';

@Injectable()
export class MediaWorkerClient {
  private readonly logger = new Logger(MediaWorkerClient.name);

  constructor(private readonly config: MediaConfigService) {}

  async processImage(params: {
    mediaId: string;
    originalPath: string;
    projectId: string;
    mode: ProcessingMode;
  }): Promise<ImageProcessingResultDto> {
    const url = `${this.config.workerUrl}/process`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.workerTimeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: params.mediaId,
          originalPath: params.originalPath,
          projectId: params.projectId,
          mode: params.mode,
          enableVlm: this.config.enableVlm,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Media worker error ${response.status}: ${text}`);
      }

      return (await response.json()) as ImageProcessingResultDto;
    } catch (error) {
      this.logger.warn(`Media worker indisponível, usando fallback local: ${error}`);
      return this.buildFallbackResult(params);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async buildFallbackResult(params: {
    mediaId: string;
    originalPath: string;
    mode: ProcessingMode;
  }): Promise<ImageProcessingResultDto> {
    const fs = await import('fs/promises');
    const stat = await fs.stat(params.originalPath).catch(() => null);

    return {
      mediaId: params.mediaId,
      type: 'image',
      imageType: 'unknown',
      processingMode: params.mode,
      metadata: {
        width: 0,
        height: 0,
        format: 'unknown',
        sizeBytes: stat?.size ?? 0,
        sha256: '',
      },
      ocr: { provider: 'disabled', language: [], fullText: '', blocks: [] },
      layout: { provider: 'disabled', blocks: [] },
      vision: {
        provider: 'disabled',
        enabled: false,
        summary: null,
        objects: [],
        uiElements: [],
      },
      semantic: {
        summary: 'Image uploaded; processing worker unavailable.',
        tags: ['image', 'pending-processing'],
        entities: [],
        possibleIntent: 'unknown',
      },
      warnings: ['Media worker unavailable; minimal metadata only.'],
    };
  }
}
