import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { estimateTokenCount } from '../common/constants';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async findByProject(projectId: string) {
    return this.prisma.conversation.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        summaries: { orderBy: { createdAt: 'desc' }, take: 1 },
        toolCalls: { include: { result: true }, orderBy: { startedAt: 'asc' } },
      },
    });
  }

  async create(projectId: string, title?: string) {
    return this.prisma.conversation.create({
      data: {
        projectId,
        title: title || 'Nova conversa',
        model: this.config.get<string>('llm.model'),
      },
    });
  }

  async addMessage(conversationId: string, role: string, content: string) {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        tokenCount: estimateTokenCount(content),
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return message;
  }
}
