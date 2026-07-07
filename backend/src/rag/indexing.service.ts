import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import { PrismaService } from '../database/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import { ChunkingService } from './chunking.service';
import { ContentExtractorService } from './content-extractor.service';
import { computeContentHash } from './hash.service';
import { estimateTokenCount } from '../common/constants';
import { DocumentType } from './document-type';

export interface IndexFileResult {
  fileId: string;
  indexed: boolean;
  skipped: boolean;
  reason?: string;
  chunksCount?: number;
}

export interface IndexFromDiskInput {
  projectId: string;
  filePath: string;
  filename: string;
  priority?: number;
}

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly chunking: ChunkingService,
    private readonly extractor: ContentExtractorService,
  ) {}

  async indexFromDisk(input: IndexFromDiskInput): Promise<IndexFileResult> {
    const { content, documentType } = await this.extractor.extractFromPath(
      input.filePath,
      input.filename,
    );
    const hash = computeContentHash(content);
    const stats = await fs.stat(input.filePath).catch(() => null);

    return this.indexContent({
      projectId: input.projectId,
      path: input.filePath,
      filename: input.filename,
      content,
      hash,
      documentType,
      priority: input.priority,
      lastModified: stats?.mtime,
    });
  }

  async indexContent(params: {
    projectId: string;
    path: string;
    filename: string;
    content: string;
    hash: string;
    documentType: DocumentType;
    priority?: number;
    lastModified?: Date;
  }): Promise<IndexFileResult> {
    const chunkConfigHash = this.chunking.getConfigHash();
    const embeddingModel = this.embeddings.model;

    const existing = await this.prisma.file.findFirst({
      where: {
        projectId: params.projectId,
        path: params.path,
        deletedAt: null,
      },
    });

    if (
      existing &&
      existing.hash === params.hash &&
      existing.embeddingModel === embeddingModel &&
      existing.chunkConfigHash === chunkConfigHash &&
      existing.indexedAt
    ) {
      this.logger.log(`Arquivo inalterado, pulando: ${params.path}`);
      return {
        fileId: existing.id,
        indexed: false,
        skipped: true,
        reason: 'hash_unchanged',
      };
    }

    const extension = params.filename.includes('.')
      ? params.filename.split('.').pop()
      : null;

    const file = existing
      ? await this.prisma.file.update({
          where: { id: existing.id },
          data: {
            filename: params.filename,
            extension,
            documentType: params.documentType,
            hash: params.hash,
            size: Buffer.byteLength(params.content, 'utf-8'),
            priority: params.priority ?? existing.priority,
            lastModified: params.lastModified ?? new Date(),
            embeddingModel,
            chunkConfigHash,
            deletedAt: null,
          },
        })
      : await this.prisma.file.create({
          data: {
            projectId: params.projectId,
            path: params.path,
            filename: params.filename,
            extension,
            documentType: params.documentType,
            hash: params.hash,
            size: Buffer.byteLength(params.content, 'utf-8'),
            priority: params.priority ?? 3,
            lastModified: params.lastModified ?? new Date(),
            embeddingModel,
            chunkConfigHash,
          },
        });

    await this.clearFileIndex(file.id);

    const chunks = this.chunking.split(params.content);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = await this.prisma.fileChunk.create({
        data: {
          fileId: file.id,
          chunkIndex: i,
          content: chunks[i],
          tokenCount: estimateTokenCount(chunks[i]),
        },
      });

      const vector = await this.embeddings.generate(chunks[i]);
      if (vector.length > 0) {
        const record = await this.prisma.embedding.create({
          data: { chunkId: chunk.id, embeddingModel },
        });
        const vectorStr = `[${vector.join(',')}]`;
        await this.prisma.$executeRawUnsafe(
          `UPDATE embeddings SET vector = $1::vector WHERE id = $2::uuid`,
          vectorStr,
          record.id,
        );
      }
    }

    await this.prisma.file.update({
      where: { id: file.id },
      data: { indexedAt: new Date() },
    });

    await this.prisma.job.create({
      data: {
        projectId: params.projectId,
        type: 'index_file',
        status: 'completed',
        payload: { fileId: file.id, path: params.path, chunks: chunks.length },
        finishedAt: new Date(),
      },
    });

    this.logger.log(`Indexado ${file.id} (${chunks.length} chunks)`);
    return {
      fileId: file.id,
      indexed: true,
      skipped: false,
      chunksCount: chunks.length,
    };
  }

  /** @deprecated Use indexContent */
  async indexFile(
    projectId: string,
    filePath: string,
    filename: string,
    content: string,
  ) {
    const { documentType } = this.extractor.extractFromContent(content, filename);
    const result = await this.indexContent({
      projectId,
      path: filePath,
      filename,
      content,
      hash: computeContentHash(content),
      documentType,
    });
    return this.prisma.file.findUnique({ where: { id: result.fileId } });
  }

  async reindexProject(projectId: string): Promise<{ reindexed: number; skipped: number }> {
    const files = await this.prisma.file.findMany({
      where: { projectId, deletedAt: null },
    });

    let reindexed = 0;
    let skipped = 0;

    for (const file of files) {
      try {
        const { content, documentType } = await this.extractor.extractFromPath(
          file.path,
          file.filename,
        );
        const result = await this.indexContent({
          projectId,
          path: file.path,
          filename: file.filename,
          content,
          hash: computeContentHash(content),
          documentType,
          priority: file.priority,
        });
        if (result.skipped) skipped++;
        else reindexed++;
      } catch (error) {
        this.logger.warn(`Falha ao reindexar ${file.path}: ${error}`);
      }
    }

    return { reindexed, skipped };
  }

  async reindexByModelChange(projectId: string): Promise<number> {
    const files = await this.prisma.file.findMany({
      where: {
        projectId,
        deletedAt: null,
        OR: [
          { embeddingModel: { not: this.embeddings.model } },
          { embeddingModel: null },
        ],
      },
    });

    for (const file of files) {
      await this.prisma.file.update({
        where: { id: file.id },
        data: { hash: null, indexedAt: null },
      });
    }

    const result = await this.reindexProject(projectId);
    return result.reindexed;
  }

  async removeFromIndex(fileId: string): Promise<void> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) return;

    await this.prisma.fileDeletionAudit.create({
      data: {
        projectId: file.projectId,
        filePath: file.path,
        filename: file.filename,
        hash: file.hash,
      },
    });

    await this.clearFileIndex(fileId);
    await this.prisma.file.update({
      where: { id: fileId },
      data: { deletedAt: new Date(), indexedAt: null },
    });

    await this.prisma.job.create({
      data: {
        projectId: file.projectId,
        type: 'delete_file_index',
        status: 'completed',
        payload: { fileId, path: file.path },
        finishedAt: new Date(),
      },
    });
  }

  private async clearFileIndex(fileId: string) {
    const chunks = await this.prisma.fileChunk.findMany({
      where: { fileId },
      select: { id: true },
    });
    const chunkIds = chunks.map((c) => c.id);

    if (chunkIds.length) {
      await this.prisma.embedding.deleteMany({
        where: { chunkId: { in: chunkIds } },
      });
    }
    await this.prisma.fileChunk.deleteMany({ where: { fileId } });
  }
}
