import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../database/prisma.service';

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

  async listByProject(projectId: string) {
    return this.prisma.file.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { lastModified: 'desc' },
      include: {
        _count: { select: { chunks: true } },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.file.findUnique({
      where: { id },
      include: { chunks: { orderBy: { chunkIndex: 'asc' } } },
    });
  }
}
