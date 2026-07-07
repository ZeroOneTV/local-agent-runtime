import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../database/prisma.service';
import { parsePagination, toPaginated } from '../common/pagination';

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get uploadsPath(): string {
    return this.config.get<string>('storage.uploads') || '/storage/uploads';
  }

  async saveUpload(
    projectId: string,
    originalName: string,
    buffer: Buffer,
  ) {
    await fs.mkdir(this.uploadsPath, { recursive: true });

    const storedName = `${Date.now()}-${originalName}`;
    const storedPath = path.join(this.uploadsPath, storedName);
    await fs.writeFile(storedPath, buffer);

    const extension = path.extname(originalName).replace('.', '') || null;

    return this.prisma.file.create({
      data: {
        projectId,
        path: storedPath,
        filename: originalName,
        extension,
        size: buffer.length,
        lastModified: new Date(),
      },
    });
  }

  async listByProject(
    projectId: string,
    limit?: string | number,
    offset?: string | number,
  ) {
    const { limit: take, offset: skip } = parsePagination(limit, offset);

    const where = { projectId, deletedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        orderBy: { lastModified: 'desc' },
        include: { _count: { select: { chunks: true } } },
        take,
        skip,
      }),
      this.prisma.file.count({ where }),
    ]);

    return toPaginated(items, total, take, skip);
  }

  async findOne(id: string) {
    return this.prisma.file.findUnique({
      where: { id },
      include: { chunks: { orderBy: { chunkIndex: 'asc' } } },
    });
  }
}
