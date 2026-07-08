import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrchestratorConfigService } from './orchestrator.config';
import { WebhookDispatcherService } from './webhook-dispatcher.service';

export type OrchestratorEventType =
  | 'task.created'
  | 'task.started'
  | 'task.progress'
  | 'task.waiting_approval'
  | 'task.completed'
  | 'task.failed'
  | 'tool.pending_approval'
  | 'tool.started'
  | 'tool.completed'
  | 'tool.failed'
  | 'memory.suggested'
  | 'memory.saved'
  | 'memory.working.updated'
  | 'memory.recent.created'
  | 'memory.recent.expired'
  | 'memory.consolidation.suggested'
  | 'memory.consolidated.saved'
  | 'memory.deep.created'
  | 'memory.archived'
  | 'memory.export.started'
  | 'memory.export.completed'
  | 'memory.export.failed'
  | 'memory.import.started'
  | 'memory.import.completed'
  | 'memory.import.failed'
  | 'memory.reembedding.started'
  | 'memory.reembedding.completed'
  | 'media.uploaded'
  | 'media.processing.started'
  | 'media.processing.progress'
  | 'media.processing.cached'
  | 'media.processing.ocr.completed'
  | 'media.processing.layout.completed'
  | 'media.processing.document.completed'
  | 'media.processing.vision.completed'
  | 'media.processing.completed'
  | 'media.processing.failed'
  | 'media.indexing.pending_approval'
  | 'media.indexed';

@Injectable()
export class EventService {
  private readonly listeners: ((event: OrchestratorEventType, payload: unknown) => void)[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: OrchestratorConfigService,
    private readonly webhooks: WebhookDispatcherService,
  ) {}

  async emit(
    type: OrchestratorEventType,
    projectId: string,
    conversationId: string | undefined,
    payload?: unknown,
  ): Promise<string | undefined> {
    if (!this.config.eventSystemEnabled) return undefined;

    const record = await this.prisma.orchestratorEvent.create({
      data: {
        projectId,
        conversationId,
        type,
        payload: (payload ?? {}) as Prisma.InputJsonValue,
      },
    });

    for (const listener of this.listeners) {
      try {
        listener(type, { id: record.id, ...(payload as object) });
      } catch {
        // ignore listener errors
      }
    }

    await this.webhooks.dispatch(type, projectId, conversationId, {
      id: record.id,
      ...(payload as object),
    });

    return record.id;
  }

  async findByConversation(
    conversationId: string,
    limit = 50,
    offset = 0,
  ) {
    const [items, total] = await Promise.all([
      this.prisma.orchestratorEvent.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.orchestratorEvent.count({ where: { conversationId } }),
    ]);
    return { items, total, limit, offset, hasMore: offset + items.length < total };
  }

  async findByProject(projectId: string, limit = 50, offset = 0) {
    const [items, total] = await Promise.all([
      this.prisma.orchestratorEvent.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.orchestratorEvent.count({ where: { projectId } }),
    ]);
    return { items, total, limit, offset, hasMore: offset + items.length < total };
  }
}
