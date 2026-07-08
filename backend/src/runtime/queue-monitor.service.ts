import { Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { getAppRole, shouldRunProcessor } from './app-role.util';

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface WorkersHealthReport {
  appRole: string;
  processorsEnabled: Record<string, boolean>;
  queues: Record<string, QueueCounts>;
}

@Injectable()
export class QueueMonitorService {
  constructor(
    @Optional() @InjectQueue('orchestrator-jobs') private readonly orchestrator?: Queue,
    @Optional() @InjectQueue('file-index') private readonly fileIndex?: Queue,
    @Optional() @InjectQueue('embeddings') private readonly embeddings?: Queue,
    @Optional() @InjectQueue('media-processing') private readonly media?: Queue,
    @Optional() @InjectQueue('memory-jobs') private readonly memory?: Queue,
  ) {}

  async getQueueCounts(): Promise<Record<string, QueueCounts>> {
    const entries: [string, Queue | undefined][] = [
      ['orchestrator', this.orchestrator],
      ['indexing', this.fileIndex],
      ['embeddings', this.embeddings],
      ['media', this.media],
      ['memory', this.memory],
    ];

    const result: Record<string, QueueCounts> = {};
    for (const [name, queue] of entries) {
      if (!queue) continue;
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );
      result[name] = {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };
    }
    return result;
  }

  async getWorkersReport(): Promise<WorkersHealthReport> {
    return {
      appRole: getAppRole(),
      processorsEnabled: {
        orchestrator: shouldRunProcessor('orchestrator'),
        indexing: shouldRunProcessor('indexing'),
        embeddings: shouldRunProcessor('embeddings'),
        memory: shouldRunProcessor('memory'),
        media: shouldRunProcessor('media'),
      },
      queues: await this.getQueueCounts(),
    };
  }
}
