import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  MemoryOrigin,
  VALID_MEMORY_ORIGINS,
  isValidMemoryContent,
} from './memory.types';

export interface CreateMemoryInput {
  projectId: string;
  title: string;
  content: string;
  importance?: number;
  origin: MemoryOrigin;
  reason?: string;
}

export interface UpdateMemoryInput {
  title?: string;
  content?: string;
  importance?: number;
  reason: string;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByProject(projectId: string) {
    return this.prisma.memory.findMany({
      where: { projectId, active: true },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const memory = await this.prisma.memory.findUnique({
      where: { id },
      include: { history: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!memory) throw new NotFoundException('Memória não encontrada');
    return memory;
  }

  async create(input: CreateMemoryInput) {
    this.validateOrigin(input.origin);
    this.validateContent(input.content);

    const conflict = await this.findConflict(
      input.projectId,
      input.title,
      input.content,
    );

    if (conflict) {
      return this.supersede(conflict.id, input);
    }

    const memory = await this.prisma.memory.create({
      data: {
        projectId: input.projectId,
        title: input.title,
        content: input.content,
        importance: input.importance ?? 3,
        origin: input.origin,
      },
    });

    await this.recordHistory(memory.id, 'created', {
      newTitle: memory.title,
      newContent: memory.content,
      reason: input.reason ?? `Origem: ${input.origin}`,
    });

    this.logger.log(`Memória criada: ${memory.id}`);
    return memory;
  }

  async update(id: string, input: UpdateMemoryInput) {
    const existing = await this.prisma.memory.findUnique({ where: { id } });
    if (!existing || !existing.active) {
      throw new NotFoundException('Memória não encontrada');
    }

    if (input.content) this.validateContent(input.content);

    const updated = await this.prisma.memory.update({
      where: { id },
      data: {
        title: input.title ?? existing.title,
        content: input.content ?? existing.content,
        importance: input.importance ?? existing.importance,
      },
    });

    await this.recordHistory(id, 'updated', {
      previousTitle: existing.title,
      previousContent: existing.content,
      newTitle: updated.title,
      newContent: updated.content,
      reason: input.reason,
    });

    return updated;
  }

  async supersede(existingId: string, input: CreateMemoryInput) {
    const existing = await this.prisma.memory.findUnique({
      where: { id: existingId },
    });
    if (!existing) throw new NotFoundException('Memória não encontrada');

    await this.prisma.memory.update({
      where: { id: existingId },
      data: { active: false },
    });

    await this.recordHistory(existingId, 'superseded', {
      previousTitle: existing.title,
      previousContent: existing.content,
      reason: input.reason ?? 'Conflito detectado — nova versão criada',
    });

    const newMemory = await this.prisma.memory.create({
      data: {
        projectId: input.projectId,
        title: input.title,
        content: input.content,
        importance: input.importance ?? existing.importance,
        origin: input.origin,
      },
    });

    await this.recordHistory(newMemory.id, 'created', {
      newTitle: newMemory.title,
      newContent: newMemory.content,
      reason: `Substitui memória ${existingId}`,
    });

    this.logger.log(`Memória ${existingId} substituída por ${newMemory.id}`);
    return newMemory;
  }

  async getHistory(memoryId: string) {
    return this.prisma.memoryHistory.findMany({
      where: { memoryId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private validateOrigin(origin: string) {
    if (!VALID_MEMORY_ORIGINS.includes(origin as MemoryOrigin)) {
      throw new BadRequestException(`Origem inválida: ${origin}`);
    }
  }

  private validateContent(content: string) {
    if (!isValidMemoryContent(content)) {
      throw new BadRequestException(
        'Conteúdo inválido para memória permanente (parece ser contexto temporário)',
      );
    }
  }

  private async findConflict(
    projectId: string,
    title: string,
    content: string,
  ) {
    const normalizedTitle = title.toLowerCase().trim();
    return this.prisma.memory.findFirst({
      where: {
        projectId,
        active: true,
        OR: [
          { title: { equals: title, mode: 'insensitive' } },
          { content: { equals: content, mode: 'insensitive' } },
          { title: { contains: normalizedTitle, mode: 'insensitive' } },
        ],
      },
    });
  }

  private async recordHistory(
    memoryId: string,
    action: string,
    data: {
      previousTitle?: string;
      previousContent?: string;
      newTitle?: string;
      newContent?: string;
      reason?: string;
    },
  ) {
    await this.prisma.memoryHistory.create({
      data: {
        memoryId,
        action,
        previousTitle: data.previousTitle,
        previousContent: data.previousContent,
        newTitle: data.newTitle,
        newContent: data.newContent,
        reason: data.reason,
      },
    });
  }
}
