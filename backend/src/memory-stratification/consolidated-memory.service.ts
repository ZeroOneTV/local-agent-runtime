import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RetrievalService } from '../rag/retrieval.service';
import { RetrievedMemoryItem, computeCompositeScore, textSimilarity } from './memory.types';
import { MemoryStratificationConfigService } from './memory-stratification.config';

@Injectable()
export class ConsolidatedMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
    private readonly config: MemoryStratificationConfigService,
  ) {}

  async search(
    projectId: string,
    query: string,
    limit = 5,
  ): Promise<RetrievedMemoryItem[]> {
    const ranked = await this.retrieval.searchRelevantMemories(projectId, query, limit);
    const now = Date.now();

    return ranked.map((m) => {
      const recencyDays = 30;
      return {
        id: m.id,
        layer: 'consolidated' as const,
        title: m.title,
        content: m.content,
        score: computeCompositeScore({
          similarity: textSimilarity(query, `${m.title} ${m.content}`) || m.score,
          importance: m.importance,
          recencyDays,
          accessCount: 0,
          sourceReliability: 1,
        }),
        importance: m.importance,
      };
    });
  }

  async markAccessed(id: string) {
    if (!this.config.accessRefresh) return;
    await this.prisma.memory.update({
      where: { id },
      data: {
        lastAccessedAt: new Date(),
        accessCount: { increment: 1 },
      },
    });
  }

  async findHighImportance(projectId: string, threshold = 4, limit = 10) {
    return this.prisma.memory.findMany({
      where: { projectId, active: true, importance: { gte: threshold } },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });
  }
}
