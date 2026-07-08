import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  RecentMemorySourceType,
  RetrievedMemoryItem,
  computeCompositeScore,
  textSimilarity,
} from './memory.types';
import { MemoryStratificationConfigService } from './memory-stratification.config';

export interface CreateRecentMemoryInput {
  projectId: string;
  conversationId?: string;
  title: string;
  content: string;
  summary?: string;
  sourceType: RecentMemorySourceType;
  sourceRef?: string;
  importance?: number;
  confidence?: number;
}

@Injectable()
export class RecentMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: MemoryStratificationConfigService,
  ) {}

  async create(input: CreateRecentMemoryInput) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.config.recentTtlDays);

    return this.prisma.recentMemoryItem.create({
      data: {
        projectId: input.projectId,
        conversationId: input.conversationId,
        title: input.title,
        content: input.content,
        summary: input.summary ?? input.content.slice(0, 240),
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        importance: input.importance ?? 3,
        confidence: input.confidence ?? 0.7,
        status: 'active',
        expiresAt,
      },
    });
  }

  async search(
    projectId: string,
    query: string,
    limit = 5,
    conversationId?: string,
  ): Promise<RetrievedMemoryItem[]> {
    const items = await this.prisma.recentMemoryItem.findMany({
      where: {
        projectId,
        status: 'active',
        ...(conversationId ? { conversationId } : {}),
      },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: limit * 4,
    });

    const now = Date.now();
    return items
      .map((item) => {
        const recencyDays = (now - item.updatedAt.getTime()) / 86400000;
        const score = computeCompositeScore({
          similarity: textSimilarity(query, `${item.title} ${item.content}`),
          importance: item.importance,
          recencyDays,
          accessCount: item.accessCount,
          sourceReliability: item.confidence,
        });
        return {
          id: item.id,
          layer: 'recent' as const,
          title: item.title,
          content: item.summary ?? item.content,
          score,
          importance: item.importance,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async markAccessed(id: string) {
    if (!this.config.accessRefresh) return;
    await this.prisma.recentMemoryItem.update({
      where: { id },
      data: {
        lastAccessedAt: new Date(),
        accessCount: { increment: 1 },
      },
    });
  }

  async expireStale(projectId?: string) {
    const now = new Date();
    const result = await this.prisma.recentMemoryItem.updateMany({
      where: {
        status: 'active',
        expiresAt: { lte: now },
        ...(projectId ? { projectId } : {}),
      },
      data: { status: 'expired' },
    });
    return result.count;
  }

  async findExpired(projectId?: string, limit = 100) {
    return this.prisma.recentMemoryItem.findMany({
      where: {
        status: 'expired',
        ...(projectId ? { projectId } : {}),
      },
      take: limit,
      orderBy: { updatedAt: 'asc' },
    });
  }
}
