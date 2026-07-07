import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import { PrismaService } from '../database/prisma.service';
import { IndexingService } from '../rag/indexing.service';
import { computeContentHash } from '../rag/hash.service';

@Injectable()
export class MediaRagService {
  private readonly logger = new Logger(MediaRagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly indexing: IndexingService,
  ) {}

  async indexContextFile(params: {
    projectId: string;
    mediaAssetId: string;
    contextMarkdownPath: string;
  }) {
    const content = await fs.readFile(params.contextMarkdownPath, 'utf-8');
    const filename = `image_context_${params.mediaAssetId.slice(0, 8)}.md`;

    const result = await this.indexing.indexContent({
      projectId: params.projectId,
      path: params.contextMarkdownPath,
      filename,
      content,
      hash: computeContentHash(content),
      documentType: 'image_context',
      priority: 4,
    });

    await this.prisma.mediaAsset.update({
      where: { id: params.mediaAssetId },
      data: { status: 'indexed', source: 'project_asset' },
    });

    this.logger.log(`image_context indexado para media ${params.mediaAssetId}`);
    return result;
  }
}
