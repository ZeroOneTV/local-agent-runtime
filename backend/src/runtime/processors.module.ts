import { Module } from '@nestjs/common';
import { FileIndexProcessor } from '../queue/processors/file-index.processor';
import { EmbeddingsProcessor } from '../queue/processors/embeddings.processor';
import { OrchestratorJobProcessor } from '../jobs/orchestrator-job.processor';
import { MediaProcessingProcessor } from '../media/media-processing.processor';
import { MemoryStratificationProcessor } from '../memory-stratification/memory-stratification.processor';
import { shouldRunProcessor } from './app-role.util';
import { QueueModule } from '../queue/queue.module';
import { JobsModule } from '../jobs/jobs.module';
import { MediaModule } from '../media/media.module';
import { MemoryStratificationModule } from '../memory-stratification/memory-stratification.module';
import { RagModule } from '../rag/rag.module';
import { MemoryModule } from '../memory/memory.module';
import { PrismaModule } from '../database/prisma.module';

const processorProviders = [
  ...(shouldRunProcessor('orchestrator') ? [OrchestratorJobProcessor] : []),
  ...(shouldRunProcessor('indexing') ? [FileIndexProcessor] : []),
  ...(shouldRunProcessor('embeddings') ? [EmbeddingsProcessor] : []),
  ...(shouldRunProcessor('media') ? [MediaProcessingProcessor] : []),
  ...(shouldRunProcessor('memory') ? [MemoryStratificationProcessor] : []),
];

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    RagModule,
    MemoryModule,
    JobsModule,
    MediaModule,
    MemoryStratificationModule,
  ],
  providers: processorProviders,
})
export class ProcessorsModule {}
