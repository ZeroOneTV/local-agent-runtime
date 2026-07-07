import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { JobEventService } from './job-event.service';
import { JobType, OrchestratorJobPayload } from './job.types';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobEvents: JobEventService,
    @InjectQueue('orchestrator-jobs') private readonly queue: Queue,
  ) {}

  resolveJobType(intentType: string, message: string): JobType {
    if (intentType === 'project_indexing') return 'project_indexing';
    if (/reindex|reindexar/i.test(message)) return 'rag_reindex';
    if (/analis|relatório|relatorio|arquitetura|diagnóstico/i.test(message)) {
      return 'project_analysis';
    }
    return 'project_indexing';
  }

  async createAndEnqueue(params: {
    projectId: string;
    conversationId?: string;
    message: string;
    intentType: string;
  }) {
    const type = this.resolveJobType(params.intentType, params.message);

    const payload: OrchestratorJobPayload = {
      conversationId: params.conversationId,
      message: params.message,
      stepsCompleted: 0,
      currentStep: 'init',
      intent: params.intentType,
    };

    const job = await this.prisma.job.create({
      data: {
        projectId: params.projectId,
        type,
        status: 'pending',
        payload: payload as Prisma.InputJsonValue,
      },
    });

    await this.jobEvents.created(
      job.id,
      params.projectId,
      params.conversationId,
      type,
    );

    await this.queue.add(
      'run',
      { jobId: job.id },
      { jobId: job.id, removeOnComplete: 100, removeOnFail: 50 },
    );

    this.logger.log(`Job ${job.id} (${type}) enfileirado`);

    return job;
  }
}
