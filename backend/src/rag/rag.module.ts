import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { RetrievalService } from './retrieval.service';
import { IndexingService } from './indexing.service';
import { ChunkingService } from './chunking.service';
import { ContentExtractorService } from './content-extractor.service';
import { RagConfigService } from './rag.config';
import { RagController } from './rag.controller';

@Module({
  controllers: [RagController],
  providers: [
    RagConfigService,
    EmbeddingsService,
    RetrievalService,
    IndexingService,
    ChunkingService,
    ContentExtractorService,
  ],
  exports: [
    RagConfigService,
    EmbeddingsService,
    RetrievalService,
    IndexingService,
    ChunkingService,
    ContentExtractorService,
  ],
})
export class RagModule {}
