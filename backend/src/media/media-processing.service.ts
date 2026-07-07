import { Injectable } from '@nestjs/common';
import { MediaWorkerClient } from './media-worker.client';
import { MediaStorageService } from './media-storage.service';
import { MediaContextService } from './media-context.service';
import { MediaEventService } from './media-event.service';
import { MediaConfigService } from './media.config';
import { PrismaService } from '../database/prisma.service';
import { ImageProcessingResultDto, ProcessingMode } from './media.types';

@Injectable()
export class MediaProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: MediaWorkerClient,
    private readonly storage: MediaStorageService,
    private readonly context: MediaContextService,
    private readonly events: MediaEventService,
    private readonly config: MediaConfigService,
  ) {}

  async runProcessImage(params: {
    mediaAssetId: string;
    mode?: ProcessingMode;
  }) {
    const asset = await this.prisma.mediaAsset.findUniqueOrThrow({
      where: { id: params.mediaAssetId },
    });

    const mode = params.mode ?? (this.config.defaultProcessingMode as ProcessingMode);

    const cached = await this.findCachedResult(asset.hash, mode, asset.projectId);
    if (cached) {
      return this.applyCachedResult(asset, cached);
    }

    const resultRecord = await this.prisma.mediaProcessingResult.create({
      data: {
        mediaAssetId: asset.id,
        processingMode: mode,
        status: 'running',
        startedAt: new Date(),
      },
    });

    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: 'processing' },
    });

    await this.events.emit('media.processing.started', asset.projectId, asset.conversationId ?? undefined, {
      mediaAssetId: asset.id,
      resultId: resultRecord.id,
      mode,
    });

    try {
      const dto = await this.worker.processImage({
        mediaId: asset.id,
        originalPath: asset.originalPath,
        projectId: asset.projectId,
        mode,
      });

      const saved = await this.persistResult(asset, resultRecord.id, dto, mode);
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.mediaProcessingResult.update({
        where: { id: resultRecord.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          error: { message },
        },
      });
      await this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { status: 'failed' },
      });
      await this.events.emit('media.processing.failed', asset.projectId, asset.conversationId ?? undefined, {
        mediaAssetId: asset.id,
        error: message,
      });
      throw error;
    }
  }

  private async findCachedResult(
    hash: string | null,
    mode: ProcessingMode,
    projectId: string,
  ) {
    if (!hash) return null;

    const prior = await this.prisma.mediaAsset.findFirst({
      where: {
        hash,
        projectId,
        status: { in: ['processed', 'indexed'] },
      },
      include: {
        processingResults: {
          where: { processingMode: mode, status: 'completed' },
          orderBy: { finishedAt: 'desc' },
          take: 1,
        },
      },
    });

    const result = prior?.processingResults[0];
    if (!result?.resultJson) return null;
    return { asset: prior!, result };
  }

  private async applyCachedResult(
    asset: { id: string; projectId: string; conversationId: string | null },
    cached: { asset: { id: string }; result: { resultJson: unknown; contextMarkdownPath: string | null } },
  ) {
    const dto = cached.result.resultJson as unknown as ImageProcessingResultDto;
    const contextPath =
      cached.result.contextMarkdownPath ??
      (await this.storage.saveContextMarkdown(
        asset.projectId,
        asset.id,
        this.context.buildImageContextMarkdown(dto),
      ));

    const resultRecord = await this.prisma.mediaProcessingResult.create({
      data: {
        mediaAssetId: asset.id,
        processingMode: dto.processingMode,
        status: 'completed',
        resultJson: dto as object,
        contextMarkdownPath: contextPath,
        startedAt: new Date(),
        finishedAt: new Date(),
        providerVersions: { cache: 'hash-reuse', sourceAssetId: cached.asset.id },
      },
    });

    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: 'processed' },
    });

    await this.events.emit('media.processing.completed', asset.projectId, asset.conversationId ?? undefined, {
      mediaAssetId: asset.id,
      resultId: resultRecord.id,
      cached: true,
    });

    return resultRecord;
  }

  private async persistResult(
    asset: {
      id: string;
      projectId: string;
      conversationId: string | null;
      originalPath: string;
    },
    resultId: string,
    dto: ImageProcessingResultDto,
    mode: ProcessingMode,
  ) {
    const jsonPath = await this.storage.saveProcessedJson(asset.projectId, asset.id, dto);
    const markdown = this.context.buildImageContextMarkdown(dto);
    const contextPath = await this.storage.saveContextMarkdown(asset.projectId, asset.id, markdown);

    await this.prisma.mediaOcrBlock.deleteMany({ where: { mediaAssetId: asset.id } });
    await this.prisma.mediaLayoutBlock.deleteMany({ where: { mediaAssetId: asset.id } });
    await this.prisma.mediaTag.deleteMany({ where: { mediaAssetId: asset.id } });

    if (dto.ocr.blocks.length) {
      await this.prisma.mediaOcrBlock.createMany({
        data: dto.ocr.blocks.map((b, i) => ({
          mediaAssetId: asset.id,
          provider: dto.ocr.provider,
          text: b.text,
          confidence: b.confidence,
          bbox: b.bbox ?? undefined,
          orderIndex: i,
        })),
      });
    }

    if (dto.layout.blocks.length) {
      await this.prisma.mediaLayoutBlock.createMany({
        data: dto.layout.blocks.map((b, i) => ({
          mediaAssetId: asset.id,
          provider: dto.layout.provider,
          blockType: b.type,
          content: b.content,
          confidence: b.confidence,
          bbox: b.bbox ?? undefined,
          orderIndex: i,
        })),
      });
    }

    const tagRows = [
      ...dto.semantic.tags.map((tag) => ({
        mediaAssetId: asset.id,
        tag,
        source: 'semantic',
        confidence: null as number | null,
      })),
      ...dto.semantic.entities.map((tag) => ({
        mediaAssetId: asset.id,
        tag,
        source: 'entity',
        confidence: null as number | null,
      })),
    ];
    if (tagRows.length) {
      await this.prisma.mediaTag.createMany({ data: tagRows });
    }

    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: 'processed',
        hash: dto.metadata.sha256 || undefined,
        width: dto.metadata.width || undefined,
        height: dto.metadata.height || undefined,
        size: dto.metadata.sizeBytes || undefined,
        thumbnailPath: dto.thumbnailPath,
      },
    });

    const updated = await this.prisma.mediaProcessingResult.update({
      where: { id: resultId },
      data: {
        status: 'completed',
        resultJson: { ...dto, processedJsonPath: jsonPath } as object,
        contextMarkdownPath: contextPath,
        finishedAt: new Date(),
        providerVersions: {
          ocr: dto.ocr.provider,
          layout: dto.layout.provider,
          vision: dto.vision.provider,
        },
      },
    });

    await this.events.emit('media.processing.completed', asset.projectId, asset.conversationId ?? undefined, {
      mediaAssetId: asset.id,
      resultId: updated.id,
      summary: dto.semantic.summary,
      tags: dto.semantic.tags,
    });

    return updated;
  }

  async waitForResult(mediaAssetId: string, timeoutMs?: number) {
    const deadline = Date.now() + (timeoutMs ?? this.config.waitForProcessingMs);
    while (Date.now() < deadline) {
      const result = await this.prisma.mediaProcessingResult.findFirst({
        where: { mediaAssetId, status: 'completed' },
        orderBy: { finishedAt: 'desc' },
      });
      if (result) return result;

      const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
      if (asset?.status === 'failed') return null;

      await new Promise((r) => setTimeout(r, 400));
    }
    return null;
  }
}
