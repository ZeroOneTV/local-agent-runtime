import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MemoryService } from '../../memory/memory.service';
import { MemoryOrigin } from '../../memory/memory.types';

@Processor('embeddings')
export class EmbeddingsProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingsProcessor.name);

  constructor(private readonly memories: MemoryService) {
    super();
  }

  async process(
    job: Job<{
      projectId: string;
      title: string;
      content: string;
      importance?: number;
      origin?: MemoryOrigin;
      reason?: string;
    }>,
  ) {
    this.logger.log(`Criando memória para projeto: ${job.data.projectId}`);
    return this.memories.create({
      projectId: job.data.projectId,
      title: job.data.title,
      content: job.data.content,
      importance: job.data.importance,
      origin: job.data.origin ?? 'backend_synthesis',
      reason: job.data.reason,
    });
  }
}
