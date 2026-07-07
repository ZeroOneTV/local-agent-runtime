import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'crypto';
import * as path from 'path';
import { PrismaService } from '../database/prisma.service';
import { MediaStorageService } from './media-storage.service';
import { MediaProcessingService } from './media-processing.service';
import { MediaRagService } from './media-rag.service';
import { MediaEventService } from './media-event.service';
import { MediaConfigService } from './media.config';
import {
  ImageProcessingResultDto,
  ProcessingMode,
  isImageFilename,
  isImageMime,
} from './media.types';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageService,
    private readonly processing: MediaProcessingService,
    private readonly rag: MediaRagService,
    private readonly events: MediaEventService,
    private readonly config: MediaConfigService,
    @InjectQueue('media-processing') private readonly queue: Queue,
  ) {}

  async uploadImage(params: {
    projectId: string;
    conversationId?: string;
    buffer: Buffer;
    filename: string;
    mimeType?: string;
    enqueueProcessing?: boolean;
  }) {
    const { buffer, filename, projectId } = params;

    if (!isImageFilename(filename) && !isImageMime(params.mimeType)) {
      throw new BadRequestException('Arquivo não é uma imagem suportada');
    }

    if (buffer.length > this.config.maxFileBytes) {
      throw new BadRequestException(
        `Imagem excede limite de ${Math.round(this.config.maxFileBytes / 1024 / 1024)}MB`,
      );
    }

    const hash = createHash('sha256').update(buffer).digest('hex');
    const ext = path.extname(filename).replace('.', '') || 'png';
    const mediaId = randomUUID();

    const originalPath = await this.storage.saveOriginal(projectId, mediaId, buffer, ext);

    const asset = await this.prisma.mediaAsset.create({
      data: {
        id: mediaId,
        projectId,
        conversationId: params.conversationId,
        source: 'conversation_upload',
        mediaType: 'image',
        mimeType: params.mimeType,
        originalPath,
        hash,
        size: buffer.length,
        status: 'uploaded',
      },
    });

    await this.events.emit('media.uploaded', projectId, params.conversationId, {
      mediaAssetId: asset.id,
      filename,
      size: buffer.length,
    });

    if (params.enqueueProcessing !== false) {
      await this.enqueueProcessImage(asset.id);
    }

    return asset;
  }

  async enqueueProcessImage(mediaAssetId: string, mode?: ProcessingMode) {
    await this.queue.add(
      'process_image',
      { mediaAssetId, mode },
      { jobId: `media-${mediaAssetId}-${Date.now()}`, removeOnComplete: 50 },
    );
    return { queued: true, mediaAssetId };
  }

  async processImageSync(mediaAssetId: string, mode?: ProcessingMode) {
    return this.processing.runProcessImage({ mediaAssetId, mode });
  }

  async getResult(mediaAssetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaAssetId },
      include: {
        processingResults: { orderBy: { createdAt: 'desc' }, take: 1 },
        tags: true,
      },
    });
    if (!asset) throw new NotFoundException('Media asset não encontrado');

    const latest = asset.processingResults[0];
    return {
      asset: {
        id: asset.id,
        projectId: asset.projectId,
        conversationId: asset.conversationId,
        status: asset.status,
        mimeType: asset.mimeType,
        thumbnailPath: asset.thumbnailPath,
        hash: asset.hash,
      },
      result: latest?.resultJson ?? null,
      contextMarkdownPath: latest?.contextMarkdownPath ?? null,
      tags: asset.tags.map((t) => t.tag),
    };
  }

  async searchMedia(params: {
    projectId: string;
    query: string;
    conversationId?: string;
    scope?: 'conversation' | 'project' | 'conversation_or_project';
  }) {
    const scope = params.scope ?? 'conversation_or_project';
    const q = params.query.trim().toLowerCase();
    if (!q) return [];

    const whereBase: Record<string, unknown> = {
      projectId: params.projectId,
      status: { in: ['processed', 'indexed'] },
    };

    if (scope === 'conversation' && params.conversationId) {
      whereBase.conversationId = params.conversationId;
    }

    const assets = await this.prisma.mediaAsset.findMany({
      where: whereBase,
      include: {
        ocrBlocks: true,
        tags: true,
        processingResults: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    const scored = assets
      .map((asset) => {
        const result = asset.processingResults[0]?.resultJson as unknown as
          | ImageProcessingResultDto
          | null;
        const ocrText = asset.ocrBlocks.map((b) => b.text).join(' ').toLowerCase();
        const tagText = asset.tags.map((t) => t.tag).join(' ').toLowerCase();
        const summary = (result?.semantic?.summary ?? '').toLowerCase();
        const haystack = `${ocrText} ${tagText} ${summary}`;
        const hits = q.split(/\s+/).filter((w) => haystack.includes(w)).length;
        return { asset, result, score: hits };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return scored.map(({ asset, result, score }) => ({
      mediaAssetId: asset.id,
      score,
      status: asset.status,
      summary: result?.semantic?.summary ?? null,
      tags: asset.tags.map((t) => t.tag),
      conversationId: asset.conversationId,
    }));
  }

  async promoteToProject(params: {
    mediaAssetId: string;
    indexRag?: boolean;
    saveAsProjectAsset?: boolean;
  }) {
    const asset = await this.prisma.mediaAsset.findUniqueOrThrow({
      where: { id: params.mediaAssetId },
      include: {
        processingResults: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const latest = asset.processingResults[0];
    if (!latest?.contextMarkdownPath) {
      throw new BadRequestException('Imagem ainda não processada ou sem contexto');
    }

    const updates: { source?: string; status?: string } = {};
    if (params.saveAsProjectAsset !== false) {
      updates.source = 'project_asset';
    }

    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: updates,
    });

    let indexed = false;
    if (params.indexRag) {
      await this.rag.indexContextFile({
        projectId: asset.projectId,
        mediaAssetId: asset.id,
        contextMarkdownPath: latest.contextMarkdownPath,
      });
      indexed = true;
      await this.events.emit('media.indexed', asset.projectId, asset.conversationId ?? undefined, {
        mediaAssetId: asset.id,
      });
    } else if (this.config.requireIndexConfirmation) {
      await this.events.emit(
        'media.indexing.pending_approval',
        asset.projectId,
        asset.conversationId ?? undefined,
        { mediaAssetId: asset.id },
      );
    }

    return { promoted: true, indexed, mediaAssetId: asset.id };
  }

  async indexMediaContext(mediaAssetId: string) {
    const asset = await this.prisma.mediaAsset.findUniqueOrThrow({
      where: { id: mediaAssetId },
      include: {
        processingResults: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const latest = asset.processingResults[0];
    if (!latest?.contextMarkdownPath) {
      throw new BadRequestException('Context markdown não disponível');
    }

    const result = await this.rag.indexContextFile({
      projectId: asset.projectId,
      mediaAssetId: asset.id,
      contextMarkdownPath: latest.contextMarkdownPath,
    });

    await this.events.emit('media.indexed', asset.projectId, asset.conversationId ?? undefined, {
      mediaAssetId: asset.id,
    });

    return result;
  }

  async getConversationMediaContext(conversationId: string, limit = 5): Promise<string | null> {
    const assets = await this.prisma.mediaAsset.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        processingResults: { orderBy: { createdAt: 'desc' }, take: 1 },
        tags: true,
      },
    });

    if (!assets.length) return null;

    const lines = assets.map((a) => {
      const dto = a.processingResults[0]?.resultJson as unknown as
        | ImageProcessingResultDto
        | undefined;
      const status = a.status;
      if (dto) {
        return `- [${a.id.slice(0, 8)}] ${dto.imageType} (${status}): ${dto.semantic.summary}\n  OCR: ${dto.ocr.fullText.slice(0, 300)}`;
      }
      return `- [${a.id.slice(0, 8)}] imagem (${status}): processamento pendente`;
    });

    return lines.join('\n');
  }
}
