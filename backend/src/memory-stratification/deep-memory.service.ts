import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  DeepMemorySourceType,
  RetrievedMemoryItem,
  computeCompositeScore,
  textSimilarity,
} from './memory.types';
import { MemoryStratificationConfigService } from './memory-stratification.config';

export interface CreateDeepMemoryInput {
  projectId: string;
  title: string;
  summary?: string;
  contentPreview?: string;
  sourceType: DeepMemorySourceType;
  sourceRef?: string;
  artifactPath?: string;
  contextPath?: string;
  documentType?: string;
  tags?: string[];
  importance?: number;
  embeddingModel?: string;
  chunkConfigHash?: string;
}

@Injectable()
export class DeepMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: MemoryStratificationConfigService,
  ) {}

  async create(input: CreateDeepMemoryInput) {
    return this.prisma.deepMemoryItem.create({
      data: {
        projectId: input.projectId,
        title: input.title,
        summary: input.summary,
        contentPreview: input.contentPreview?.slice(0, 2000),
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        artifactPath: input.artifactPath,
        contextPath: input.contextPath,
        documentType: input.documentType,
        tags: input.tags ?? [],
        importance: input.importance ?? 2,
        embeddingModel: input.embeddingModel,
        chunkConfigHash: input.chunkConfigHash,
        embeddingStatus: 'not_indexed',
      },
    });
  }

  async search(projectId: string, query: string, limit = 3): Promise<RetrievedMemoryItem[]> {
    const items = await this.prisma.deepMemoryItem.findMany({
      where: { projectId, archivedAt: null },
      orderBy: [{ importance: 'desc' }, { lastAccessedAt: 'desc' }],
      take: limit * 4,
    });

    const now = Date.now();
    return items
      .map((item) => {
        const text = `${item.title} ${item.summary ?? ''} ${item.contentPreview ?? ''}`;
        const recencyDays = (now - item.createdAt.getTime()) / 86400000;
        const score = computeCompositeScore({
          similarity: textSimilarity(query, text),
          importance: item.importance,
          recencyDays,
          accessCount: item.accessCount,
          sourceReliability: item.confidence,
        });
        return {
          id: item.id,
          layer: 'deep' as const,
          title: item.title,
          content: item.summary ?? item.contentPreview ?? item.title,
          score,
          importance: item.importance,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async markAccessed(id: string) {
    if (!this.config.accessRefresh) return;
    await this.prisma.deepMemoryItem.update({
      where: { id },
      data: {
        lastAccessedAt: new Date(),
        accessCount: { increment: 1 },
      },
    });
  }

  async markRequiresReembedding(projectId: string, embeddingModel: string) {
    return this.prisma.deepMemoryItem.updateMany({
      where: { projectId },
      data: {
        embeddingStatus: 'requires_reembedding',
        embeddingModel,
      },
    });
  }

  async findStaleForArchive(projectId: string, before: Date, limit = 50) {
    return this.prisma.deepMemoryItem.findMany({
      where: {
        projectId,
        archivedAt: null,
        createdAt: { lte: before },
      },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });
  }

  async markArchived(id: string) {
    return this.prisma.deepMemoryItem.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }
}
