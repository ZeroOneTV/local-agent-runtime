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
    return this.config.get<number>('media.workerTimeoutMs') ?? 120000;
  }

  get maxFileBytes(): number {
    return this.config.get<number>('media.maxFileBytes') ?? 20 * 1024 * 1024;
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
}
