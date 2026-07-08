import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MemoryOrigin } from '../memory/memory.types';
import { defaultJobOptions, JobPriority } from '../runtime/job-priority';

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue('file-index') private readonly fileIndexQueue: Queue,
    @InjectQueue('embeddings') private readonly embeddingsQueue: Queue,
  ) {}

  async enqueueFileIndex(
    projectId: string,
    filePath: string,
    filename: string,
    content: string,
  ) {
    return this.fileIndexQueue.add(
      'index-file',
      {
        projectId,
        filePath,
        filename,
        content,
      },
      { ...defaultJobOptions, priority: JobPriority.MEDIUM },
    );
  }

  async enqueueMemoryCreate(
    projectId: string,
    title: string,
    content: string,
    origin: MemoryOrigin,
    importance?: number,
    reason?: string,
  ) {
    return this.embeddingsQueue.add(
      'create-memory',
      {
        projectId,
        title,
        content,
        origin,
        importance,
        reason,
      },
      { ...defaultJobOptions, priority: JobPriority.MEDIUM },
    );
  }
}
