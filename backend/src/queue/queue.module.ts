import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueService } from './queue.service';
import { RagModule } from '../rag/rag.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'file-index' },
      { name: 'embeddings' },
    ),
    RagModule,
    MemoryModule,
  ],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
