import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RagConfigService {
  constructor(private readonly config: ConfigService) {}

  get embeddingModel(): string {
    return this.config.get<string>('rag.embeddingModel') ?? 'nomic-embed-text';
  }

  get chunkSize(): number {
    return this.config.get<number>('rag.chunkSize') ?? 1000;
  }

  get chunkOverlap(): number {
    return this.config.get<number>('rag.chunkOverlap') ?? 200;
  }
}
