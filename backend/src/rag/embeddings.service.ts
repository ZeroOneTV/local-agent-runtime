import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RagConfigService } from './rag.config';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly ragConfig: RagConfigService,
  ) {}

  private get baseUrl(): string {
    return this.config.get<string>('llm.baseUrl') || 'http://host.docker.internal:11434';
  }

  get model(): string {
    return this.ragConfig.embeddingModel;
  }

  async generate(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
      });

      if (!response.ok) {
        this.logger.warn('Embedding API unavailable, returning empty vector');
        return [];
      }

      const data = await response.json();
      return data.embedding || [];
    } catch (error) {
      this.logger.warn('Failed to generate embedding', error);
      return [];
    }
  }
}
