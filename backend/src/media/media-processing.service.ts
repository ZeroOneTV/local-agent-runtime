import { Injectable } from '@nestjs/common';
import { MediaWorkerClient } from './media-worker.client';
import { MediaStorageService } from './media-storage.service';
import { MediaContextService } from './media-context.service';
import { MediaEventService } from './media-event.service';
import { MediaConfigService } from './media.config';
import { PrismaService } from '../database/prisma.service';
import { ImageProcessingResultDto, ProcessingMode, ProcessCapabilitiesDto } from './media.types';

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
    capabilities?: ProcessCapabilitiesDto;
    enableVlm?: boolean;
  }) {
    const asset = await this.prisma.mediaAsset.findUniqueOrThrow({
      where: { id: params.mediaAssetId },
    });

    const mode = params.mode ?? (this.config.defaultProcessingMode as ProcessingMode);
    const fingerprint = this.config.buildProviderFingerprint(mode);

    const cached = await this.findCachedResult(asset.hash, mode, asset.projectId, fingerprint);
    if (cached) {
      await this.events.emit('media.processing.cached', asset.projectId, asset.conversationId ?? undefined, {
        mediaAssetId: asset.id,
        sourceAssetId: cached.asset.id,
      });
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
        capabilities: params.capabilities,
        enableVlm: params.enableVlm,
      });

      await this.emitStepEvents(asset, dto);
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
    fingerprint: Record<string, string>,
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
          take: 3,
        },
      },
    });

    if (!prior) return null;

    for (const result of prior.processingResults) {
      if (!result.resultJson) continue;
      const versions = (result.providerVersions ?? {}) as Record<string, string>;
      if (this.providerFingerprintMatches(versions, fingerprint, result.resultJson)) {
        return { asset: prior, result };
      }
    }

    return null;
  }

  private providerFingerprintMatches(
    stored: Record<string, string>,
    expected: Record<string, string>,
    resultJson: unknown,
  ): boolean {
    const dto = resultJson as ImageProcessingResultDto;
    const fromResult = dto.providerVersions ?? dto.providers;
    if (!fromResult) return stored.cache === 'hash-reuse';

    const keys = ['ocr', 'layout', 'document', 'vision'] as const;
    for (const key of keys) {
      const exp = expected[key === 'vision' ? 'vision' : key];
      const got =
        (stored[key] as string | undefined) ??
        (typeof fromResult === 'object' && fromResult !== null
          ? (fromResult as Record<string, string>)[key]
          : undefined);
      if (exp && got && exp !== got && got !== 'skipped' && got !== 'unavailable') {
        return false;
      }
    }
    return true;
  }

  private async emitStepEvents(
    asset: { id: string; projectId: string; conversationId: string | null },
    dto: ImageProcessingResultDto,
  ) {
    const base = { mediaAssetId: asset.id, performance: dto.performance };
    if (dto.ocr.fullText || dto.ocr.blocks.length) {
      await this.events.emit('media.processing.ocr.completed', asset.projectId, asset.conversationId ?? undefined, base);
    }
    if (dto.layout.blocks.length) {
      await this.events.emit('media.processing.layout.completed', asset.projectId, asset.conversationId ?? undefined, base);
    }
    if (dto.document?.markdown) {
      await this.events.emit('media.processing.document.completed', asset.projectId, asset.conversationId ?? undefined, base);
    }
    if (dto.vision.enabled && dto.vision.summary) {
      await this.events.emit('media.processing.vision.completed', asset.projectId, asset.conversationId ?? undefined, base);
    }
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
          ...(dto.providerVersions ?? {}),
          ocr: dto.providers?.ocr ?? dto.ocr.provider,
          layout: dto.providers?.layout ?? dto.layout.provider,
          document: dto.providers?.document ?? 'disabled',
          vision: dto.providers?.vision ?? dto.vision.provider,
          cacheKey: dto.cacheKey,
        },
      },
    });

    await this.events.emit('media.processing.completed', asset.projectId, asset.conversationId ?? undefined, {
      mediaAssetId: asset.id,
      resultId: updated.id,
      summary: dto.semantic.summary,
      tags: dto.semantic.tags,
      performance: dto.performance,
      providers: dto.providers,
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
