import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RecentMemoryService } from './recent-memory.service';
import { DeepMemoryService } from './deep-memory.service';
import { WorkingMemoryService } from './working-memory.service';

@Injectable()
export class MemoryEtlService {
  private readonly logger = new Logger(MemoryEtlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recent: RecentMemoryService,
    private readonly deep: DeepMemoryService,
    private readonly working: WorkingMemoryService,
  ) {}

  async extractFromConversationTurn(params: {
    projectId: string;
    conversationId: string;
    userMessage: string;
    assistantResponse: string;
    toolSummaries?: string[];
  }) {
    const summary = this.summarizeTurn(params.userMessage, params.assistantResponse);
    if (!summary) return null;

    const recent = await this.recent.create({
      projectId: params.projectId,
      conversationId: params.conversationId,
      title: summary.title,
      content: summary.content,
      summary: summary.content.slice(0, 300),
      sourceType: 'backend_synthesis',
      importance: summary.importance,
      confidence: 0.65,
    });

    if (params.toolSummaries?.length) {
      await this.working.updateConversation(params.conversationId, {
        temporaryFindings: params.toolSummaries.slice(-5),
      });
    }

    this.logger.debug(`Recent memory created: ${recent.id}`);
    return recent;
  }

  async extractFromToolResult(params: {
    projectId: string;
    conversationId?: string;
    toolName: string;
    output: string;
    artifactPath?: string | null;
    success: boolean;
  }) {
    if (!params.success || params.output.length < 40) return null;

    const title = `Resultado: ${params.toolName}`;
    const recent = await this.recent.create({
      projectId: params.projectId,
      conversationId: params.conversationId,
      title,
      content: params.output.slice(0, 1500),
      sourceType: 'tool_result',
      sourceRef: params.toolName,
      importance: 3,
    });

    if (params.output.length > 2000 || params.artifactPath) {
      await this.deep.create({
        projectId: params.projectId,
        title,
        summary: params.output.slice(0, 500),
        contentPreview: params.output.slice(0, 2000),
        sourceType: 'tool_result',
        sourceRef: params.toolName,
        artifactPath: params.artifactPath ?? undefined,
        importance: 2,
      });
    }

    return recent;
  }

  async extractFromJobResult(projectId: string, jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job?.result) return null;

    const content = JSON.stringify(job.result).slice(0, 1500);
    return this.recent.create({
      projectId,
      title: `Job ${job.type}`,
      content,
      sourceType: 'job_result',
      sourceRef: jobId,
      importance: 3,
    });
  }

  async extractFromSummary(conversationId: string) {
    const summary = await this.prisma.conversationSummary.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
    if (!summary) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) return null;

    return this.deep.create({
      projectId: conversation.projectId,
      title: 'Resumo de conversa',
      summary: summary.summary.slice(0, 800),
      contentPreview: summary.summary.slice(0, 2000),
      sourceType: 'conversation',
      sourceRef: summary.id,
      importance: 2,
    });
  }

  async promoteRecentToDeep(recentId: string) {
    const item = await this.prisma.recentMemoryItem.findUnique({
      where: { id: recentId },
    });
    if (!item) return null;

    const deep = await this.deep.create({
      projectId: item.projectId,
      title: item.title,
      summary: item.summary ?? undefined,
      contentPreview: item.content,
      sourceType: 'conversation',
      sourceRef: item.sourceRef ?? item.id,
      importance: item.importance,
    });

    await this.prisma.recentMemoryItem.update({
      where: { id: recentId },
      data: { status: 'archived' },
    });

    return deep;
  }

  private summarizeTurn(userMessage: string, assistantResponse: string) {
    const combined = `${userMessage}\n${assistantResponse}`;
    if (combined.length < 80) return null;

    const title =
      userMessage.slice(0, 60).trim() || 'Interação recente';
    const content = assistantResponse.slice(0, 1200).trim();
    const importance = /decisão|sempre|nunca|arquitetura|padrão/i.test(combined)
      ? 4
      : 3;

    return { title, content, importance };
  }
}
