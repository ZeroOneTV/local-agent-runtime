import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ArchiveType } from './memory.types';
import { MemoryStratificationConfigService } from './memory-stratification.config';

export interface CreateArchiveInput {
  projectId: string;
  archiveType: ArchiveType;
  title: string;
  summary?: string;
  storagePath: string;
  manifestRef?: string;
  checksum?: string;
  sizeBytes?: number;
  compressed?: boolean;
}

@Injectable()
export class ArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: MemoryStratificationConfigService,
  ) {}

  async create(input: CreateArchiveInput) {
    return this.prisma.archiveItem.create({ data: input });
  }

  async listByProject(projectId: string, limit = 20) {
    return this.prisma.archiveItem.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async search(projectId: string, query: string, limit = 3) {
    const items = await this.prisma.archiveItem.findMany({
      where: {
        projectId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { summary: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => ({
      id: item.id,
      layer: 'archive' as const,
      title: item.title,
      content: item.summary ?? item.title,
      score: 0.5,
    }));
  }

  getArchiveRoot() {
    return this.config.archiveStoragePath;
  }
}
