import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { LlmService } from '../llm/llm.service';
import { ContextConfigService } from './context.config';
import { SUMMARY_SYSTEM_PROMPT } from './prompts/summary.prompt';
import { estimateTokenCount } from '../common/constants';

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly contextConfig: ContextConfigService,
  ) {}

  async updateIfNeeded(conversationId: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        summaries: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!conversation || !conversation.messages.length) return;

    const latestSummary = conversation.summaries[0];
    const messagesSinceSummary = this.getMessagesSinceSummary(
      conversation.messages,
      latestSummary?.generatedUntilMessageId ?? null,
    );

    if (!this.shouldUpdate(messagesSinceSummary)) return;

    await this.generateIncrementalSummary(
      conversationId,
      latestSummary?.summary ?? null,
      messagesSinceSummary,
    );
  }

  private getMessagesSinceSummary(
    allMessages: { id: string; role: string; content: string; tokenCount: number | null }[],
    summaryUntilMessageId: string | null,
  ) {
    if (!summaryUntilMessageId) return allMessages;

    const cutoffIndex = allMessages.findIndex(
      (m) => m.id === summaryUntilMessageId,
    );
    if (cutoffIndex < 0) return allMessages;

    return allMessages.slice(cutoffIndex + 1);
  }

  private shouldUpdate(
    messages: { content: string; tokenCount: number | null }[],
  ): boolean {
    if (messages.length >= this.contextConfig.summaryMessageThreshold) {
      return true;
    }

    const totalTokens = messages.reduce(
      (sum, m) => sum + (m.tokenCount ?? estimateTokenCount(m.content)),
      0,
    );

    return totalTokens >= this.contextConfig.summaryTokenThreshold;
  }

  private async generateIncrementalSummary(
    conversationId: string,
    previousSummary: string | null,
    newMessages: { id: string; role: string; content: string }[],
  ) {
    const messagesText = newMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const userPrompt = previousSummary
      ? `Resumo anterior:\n${previousSummary}\n\nNovas mensagens:\n${messagesText}`
      : `Mensagens da conversa:\n${messagesText}`;

    let summaryContent: string;
    try {
      const response = await this.llm.chat(
        [{ role: 'user', content: userPrompt }],
        SUMMARY_SYSTEM_PROMPT,
      );
      summaryContent = response.content;
    } catch {
      summaryContent = this.buildFallbackSummary(newMessages, previousSummary);
    }

    const lastMessageId = newMessages[newMessages.length - 1].id;

    await this.prisma.conversationSummary.create({
      data: {
        conversationId,
        summary: summaryContent,
        generatedUntilMessageId: lastMessageId,
      },
    });

    this.logger.log(
      `Resumo incremental criado para conversa ${conversationId} (até mensagem ${lastMessageId})`,
    );
  }

  private buildFallbackSummary(
    messages: { role: string; content: string }[],
    previousSummary: string | null,
  ): string {
    const bullets = messages
      .slice(-6)
      .map((m) => `- ${m.role}: ${m.content.slice(0, 120)}`)
      .join('\n');

    return [
      previousSummary ? `Resumo anterior: ${previousSummary.slice(0, 300)}` : null,
      'Resumo automático (LLM indisponível):',
      bullets,
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}
