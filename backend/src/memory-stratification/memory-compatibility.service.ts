import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExportManifest } from './memory.types';

@Injectable()
export class MemoryCompatibilityService {
  constructor(private readonly config: ConfigService) {}

  getCurrentEmbeddingModel() {
    return this.config.get<string>('rag.embeddingModel') ?? 'nomic-embed-text';
  }

  getChunkConfig() {
    const chunkSize = this.config.get<number>('rag.chunkSize') ?? 1000;
    const chunkOverlap = this.config.get<number>('rag.chunkOverlap') ?? 200;
    const chunkConfigHash = this.hashConfig(chunkSize, chunkOverlap);
    return { chunkSize, chunkOverlap, chunkConfigHash };
  }

  checkEmbeddingCompatibility(manifest: ExportManifest): {
    requiresReembedding: boolean;
    reason: string;
  } {
    const currentModel = this.getCurrentEmbeddingModel();
    const exportedModel = manifest.models.embedding.model;
    const currentHash = this.getChunkConfig().chunkConfigHash;
    const exportedHash = manifest.chunking.chunkConfigHash;

    if (!exportedModel || exportedModel === 'unknown') {
      return {
        requiresReembedding: true,
        reason: 'Modelo de embedding desconhecido no export',
      };
    }

    if (exportedModel !== currentModel) {
      return {
        requiresReembedding: true,
        reason: `Modelo diferente: ${exportedModel} → ${currentModel}`,
      };
    }

    if (exportedHash !== currentHash) {
      return {
        requiresReembedding: true,
        reason: 'Configuração de chunks diferente',
      };
    }

    return { requiresReembedding: false, reason: 'Compatível' };
  }

  hashConfig(chunkSize: number, chunkOverlap: number) {
    return `cs${chunkSize}-ov${chunkOverlap}`;
  }
}
