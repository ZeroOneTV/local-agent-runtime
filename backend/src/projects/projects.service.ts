import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(ownerId: string) {
    return this.prisma.project.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { conversations: true, files: true, memories: true },
        },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.project.findUnique({
      where: { id },
      include: {
        conversations: { orderBy: { updatedAt: 'desc' }, take: 10 },
        files: true,
        memories: { orderBy: { importance: 'desc' }, take: 20 },
      },
    });
  }

  async create(
    ownerId: string,
    name: string,
    description?: string,
    rootPath?: string,
  ) {
    return this.prisma.project.create({
      data: { ownerId, name, description, rootPath },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      rootPath?: string;
      executionMode?: string;
    },
  ) {
    return this.prisma.project.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.project.delete({ where: { id } });
  }
}
