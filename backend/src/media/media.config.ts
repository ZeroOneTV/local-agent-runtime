import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MediaConfigService {
  constructor(private readonly config: ConfigService) {}

  get storageRoot(): string {
    return this.config.get<string>('media.storageRoot') || '/storage/media';
  }

  get workerUrl(): string {
    return this.config.get<string>('media.workerUrl') || 'http://media-worker:5000';
  }

  get workerTimeoutMs(): number {
    return this.config.get<number>('media.processingTimeoutMs') ??
      this.config.get<number>('media.workerTimeoutMs') ??
      180000;
  }

  get maxFileBytes(): number {
    return this.config.get<number>('media.maxFileBytes') ?? 25 * 1024 * 1024;
  }

  get maxWidth(): number {
    return this.config.get<number>('media.maxWidth') ?? 8000;
  }

  get maxHeight(): number {
    return this.config.get<number>('media.maxHeight') ?? 8000;
  }

  get enableVlm(): boolean {
    return this.config.get<boolean>('media.enableVlm') ?? false;
  }

  get defaultProcessingMode(): string {
    return this.config.get<string>('media.defaultProcessingMode') || 'balanced';
  }

  get waitForProcessingMs(): number {
    return this.config.get<number>('media.waitForProcessingMs') ?? 5000;
  }

  get requireIndexConfirmation(): boolean {
    return this.config.get<boolean>('media.requireIndexConfirmation') ?? true;
  }

  get ocrPrimary(): string {
    return this.config.get<string>('media.ocrPrimary') || 'paddleocr';
  }

  get enablePaddleOcr(): boolean {
    return this.config.get<boolean>('media.enablePaddleOcr') ?? true;
  }

  get enablePpStructure(): boolean {
    return this.config.get<boolean>('media.enablePpStructure') ?? true;
  }

  get enableDocling(): boolean {
    return this.config.get<boolean>('media.enableDocling') ?? true;
  }

  /** Fingerprint used for cache invalidation when provider config changes */
  buildProviderFingerprint(mode: string): Record<string, string> {
    return {
      mode,
      ocr: this.enablePaddleOcr ? this.ocrPrimary : 'tesseract',
      layout: this.enablePpStructure ? 'pp-structure' : 'heuristic-ocr',
      document: this.enableDocling ? 'docling' : 'disabled',
      vision: this.enableVlm ? this.config.get<string>('media.vlmProvider') || 'ollama' : 'disabled',
    };
  }
}
