import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RecentMemoryService } from './recent-memory.service';
import { DeepMemoryService } from './deep-memory.service';
import { ArchiveService } from './archive.service';
import { MemoryStratificationConfigService } from './memory-stratification.config';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class MemoryDecayService {
  private readonly logger = new Logger(MemoryDecayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recent: RecentMemoryService,
    private readonly deep: DeepMemoryService,
    private readonly archive: ArchiveService,
    private readonly config: MemoryStratificationConfigService,
  ) {}

  async run(projectId?: string) {
    const expiredRecent = await this.recent.expireStale(projectId);
    const promotedToDeep = await this.moveExpiredRecentToDeep(projectId);
    const archivedDeep = await this.archiveStaleDeep(projectId);

    this.logger.log(
      `Decay: expired=${expiredRecent}, toDeep=${promotedToDeep}, archivedDeep=${archivedDeep}`,
    );

    return { expiredRecent, promotedToDeep, archivedDeep };
  }

  private async moveExpiredRecentToDeep(projectId?: string) {
    const expired = await this.recent.findExpired(projectId, 100);
    let count = 0;

    for (const item of expired) {
      await this.deep.create({
        projectId: item.projectId,
        title: item.title,
        summary: item.summary ?? undefined,
        contentPreview: item.content,
        sourceType: 'conversation',
        sourceRef: item.id,
        importance: Math.max(1, item.importance - 1),
      });
      await this.prisma.recentMemoryItem.update({
        where: { id: item.id },
        data: { status: 'archived' },
      });
      count++;
    }

    return count;
  }

  private async archiveStaleDeep(projectId?: string) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.deepArchiveAfterDays);

    if (!projectId) {
      const projects = await this.prisma.project.findMany({ select: { id: true } });
      let total = 0;
      for (const p of projects) {
        total += await this.archiveStaleDeepForProject(p.id, cutoff);
      }
      return total;
    }

    return this.archiveStaleDeepForProject(projectId, cutoff);
  }

  private async archiveStaleDeepForProject(projectId: string, cutoff: Date) {
    const stale = await this.deep.findStaleForArchive(projectId, cutoff, 50);
    if (!stale.length) return 0;

    const archiveRoot = this.archive.getArchiveRoot();
    await fs.mkdir(archiveRoot, { recursive: true });

    let count = 0;
    for (const item of stale) {
      const payload = JSON.stringify(item, null, 2);
      const fileName = `deep-${item.id}.json`;
      const storagePath = path.join(archiveRoot, projectId, fileName);
      await fs.mkdir(path.dirname(storagePath), { recursive: true });
      await fs.writeFile(storagePath, payload, 'utf8');

      await this.archive.create({
        projectId,
        archiveType: 'cold_snapshot',
        title: item.title,
        summary: item.summary ?? undefined,
        storagePath,
        sizeBytes: Buffer.byteLength(payload),
      });

      await this.deep.markArchived(item.id);
      count++;
    }

    return count;
  }
}
