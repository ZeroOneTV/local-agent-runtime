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

  /**
   * Finds a conversation by matching its first user message. OpenAI-compatible
   * clients (Open WebUI included) resend the full transcript on every turn but
   * never a stable conversation id — the first user message is the one thing
   * that stays constant across turns of the same chat, so it doubles as a
   * best-effort continuity key when no id was supplied by the caller.
   */
  async findByFirstUserMessage(projectId: string, firstMessageContent: string) {
    const candidates = await this.prisma.conversation.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    return candidates.find(
      (c) =>
        c.messages[0]?.role === 'user' &&
        c.messages[0]?.content === firstMessageContent,
    );
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
