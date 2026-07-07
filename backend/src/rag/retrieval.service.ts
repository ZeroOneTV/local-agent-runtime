import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';
import {
  DOCUMENT_TYPE_PRIORITY_BOOST,
  DocumentType,
} from './document-type';

export interface RankedMemory {
  id: string;
  title: string;
  content: string;
  importance: number;
  score: number;
}

export interface RankedChunk {
  content: string;
  score: number;
  filename: string;
  chunkIndex: number;
  documentType: string | null;
}

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async searchRelevantMemories(
    projectId: string,
    query: string,
    limit = 5,
  ): Promise<RankedMemory[]> {
    const candidates = await this.prisma.memory.findMany({
      where: { projectId, active: true },
      select: { id: true, title: true, content: true, importance: true },
    });

    const queryLower = query.toLowerCase();
    const ranked = candidates
      .map((m) => {
        let score = m.importance / 5;
        if (m.title.toLowerCase().includes(queryLower)) score += 0.4;
        if (m.content.toLowerCase().includes(queryLower)) score += 0.3;
        return { ...m, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return ranked;
  }

  async searchRelevantChunks(
    projectId: string,
    query: string,
    limit = 5,
  ): Promise<string[]> {
    const ranked = await this.searchRankedChunks(projectId, query, limit);
    return ranked.map((c) => c.content);
  }

  async searchRankedChunks(
    projectId: string,
    query: string,
    limit = 5,
  ): Promise<RankedChunk[]> {
    const vectorStore = this.config.get<string>('vectorStore');

    let results: RankedChunk[] =
      vectorStore === 'pgvector'
        ? await this.searchChunksByEmbedding(projectId, query, limit * 2)
        : await this.searchChunksByText(projectId, query, limit * 2);

    if (!results.length) {
      results = await this.searchChunksByText(projectId, query, limit * 2);
    }

    const withNeighbors = await this.includeNeighborChunks(results);
    return this.deduplicateAndRank(withNeighbors).slice(0, limit);
  }

  /** @deprecated Use searchRelevantMemories + searchRelevantChunks */
  async search(projectId: string, query: string, limit = 5): Promise<string> {
    const [memories, chunks] = await Promise.all([
      this.searchRelevantMemories(projectId, query, limit),
      this.searchRelevantChunks(projectId, query, limit),
    ]);
    const parts = [
      ...chunks,
      ...memories.map((m) => `${m.title}: ${m.content}`),
    ];
    return parts.slice(0, limit).join('\n---\n');
  }

  private async searchChunksByEmbedding(
    projectId: string,
    query: string,
    limit: number,
  ): Promise<RankedChunk[]> {
    const embedding = await this.embeddings.generate(query);
    if (!embedding.length) return [];

    const vectorStr = `[${embedding.join(',')}]`;
    const results = await this.prisma.$queryRawUnsafe<
      {
        content: string;
        filename: string;
        chunk_index: number;
        document_type: string | null;
        priority: number;
        distance: number;
      }[]
    >(
      `SELECT fc.content, f.filename, fc.chunk_index, f.document_type, f.priority,
              (e.vector <=> $2::vector) AS distance
       FROM embeddings e
       JOIN file_chunks fc ON fc.id = e.chunk_id
       JOIN files f ON f.id = fc.file_id
       WHERE f.project_id = $1::uuid AND f.deleted_at IS NULL
       ORDER BY distance ASC
       LIMIT $3`,
      projectId,
      vectorStr,
      limit,
    );

    return results.map((r) => ({
      content: r.content,
      filename: r.filename,
      chunkIndex: r.chunk_index,
      documentType: r.document_type,
      score: this.computeChunkScore(r.distance, r.priority, r.document_type),
    }));
  }

  private async searchChunksByText(
    projectId: string,
    query: string,
    limit: number,
  ): Promise<RankedChunk[]> {
    const chunks = await this.prisma.fileChunk.findMany({
      where: {
        content: { contains: query, mode: 'insensitive' },
        file: { projectId, deletedAt: null },
      },
      take: limit,
      include: { file: true },
    });

    return chunks.map((c) => ({
      content: c.content,
      filename: c.file.filename,
      chunkIndex: c.chunkIndex,
      documentType: c.file.documentType,
      score: (c.file.priority / 5) * 0.5 + 0.5,
    }));
  }

  private computeChunkScore(
    distance: number,
    priority: number,
    documentType: string | null,
  ): number {
    const similarity = 1 / (1 + distance);
    const priorityBoost = priority / 5 * 0.2;
    const typeBoost =
      DOCUMENT_TYPE_PRIORITY_BOOST[(documentType as DocumentType) ?? 'unknown'] ??
      0;
    return similarity + priorityBoost + typeBoost;
  }

  private async includeNeighborChunks(
    chunks: RankedChunk[],
  ): Promise<RankedChunk[]> {
    const enriched = [...chunks];

    for (const chunk of chunks) {
      const file = await this.prisma.file.findFirst({
        where: { filename: chunk.filename, deletedAt: null },
        include: {
          chunks: {
            where: {
              chunkIndex: {
                in: [chunk.chunkIndex - 1, chunk.chunkIndex + 1],
              },
            },
          },
        },
      });

      if (!file) continue;

      for (const neighbor of file.chunks) {
        enriched.push({
          content: neighbor.content,
          filename: file.filename,
          chunkIndex: neighbor.chunkIndex,
          documentType: file.documentType,
          score: chunk.score * 0.8,
        });
      }
    }

    return enriched;
  }

  private deduplicateAndRank(chunks: RankedChunk[]): RankedChunk[] {
    const seen = new Set<string>();
    return chunks
      .filter((c) => {
        const key = `${c.filename}:${c.chunkIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }
}
