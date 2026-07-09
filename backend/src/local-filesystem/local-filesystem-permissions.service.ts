import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class LocalFilesystemPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(projectId?: string) {
    return this.prisma.projectFilesystemPermission.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: {
    projectId: string;
    mode: string;
    hostPrefix: string;
    containerPrefix?: string;
    accessLevel: string;
    isActive?: boolean;
  }) {
    return this.prisma.projectFilesystemPermission.create({
      data: {
        projectId: data.projectId,
        mode: data.mode,
        hostPrefix: data.hostPrefix,
        containerPrefix: data.containerPrefix,
        accessLevel: data.accessLevel,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(
    id: string,
    data: {
      mode?: string;
      hostPrefix?: string;
      containerPrefix?: string;
      accessLevel?: string;
      isActive?: boolean;
    },
  ) {
    try {
      return await this.prisma.projectFilesystemPermission.update({
        where: { id },
        data,
      });
    } catch {
      throw new NotFoundException('Permissão não encontrada');
    }
  }

  async delete(id: string) {
    try {
      await this.prisma.projectFilesystemPermission.delete({ where: { id } });
      return { deleted: true };
    } catch {
      throw new NotFoundException('Permissão não encontrada');
    }
  }
}
