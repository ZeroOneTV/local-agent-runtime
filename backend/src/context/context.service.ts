import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { RetrievalService } from '../rag/retrieval.service';
import { ContextConfigService } from './context.config';
import { estimateTokenCount } from '../common/constants';
import { SYSTEM_PROMPT } from '../llm/prompts/system.prompt';
import { TOOL_USE_PROMPT } from '../llm/prompts/tool-use.prompt';
import {
  BuildContextInput,
  BuiltContext,
  ContextLayer,
  ContextMetadata,
} from './context.types';
import { ChatMessage } from '../llm/llm.service';

@Injectable()
export class ContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
    private readonly contextConfig: ContextConfigService,
    private readonly config: ConfigService,
  ) {}

  async build(input: BuildContextInput): Promise<BuiltContext> {
    const { conversationId, projectId, currentMessage } = input;

    const [project, conversation, settings] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId } }),
      this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          summaries: { orderBy: { createdAt: 'desc' }, take: 1 },
          toolCalls: {
            include: { result: true },
            orderBy: { startedAt: 'desc' },
            take: this.contextConfig.recentToolResultsLimit,
          },
        },
      }),
      this.prisma.setting.findMany(),
    ]);

    if (!project || !conversation) {
      throw new Error('Projeto ou conversa não encontrados');
    }

    const layers: ContextLayer[] = [];
    const layersIncluded: string[] = [];

    // 1. Instruções do sistema
    layers.push({
      name: 'system',
      content: [SYSTEM_PROMPT, TOOL_USE_PROMPT].join('\n\n'),
    });
    layersIncluded.push('system');

    // 2. Configuração do projeto
    const projectLayer = await this.buildProjectLayer(
      project,
      settings,
      projectId,
    );
    if (projectLayer) {
      layers.push({ name: 'project', content: projectLayer });
      layersIncluded.push('project');
    }

    // 3. Resumo da conversa
    const latestSummary = conversation.summaries[0];
    const summaryUsed = !!latestSummary;
    if (latestSummary) {
      layers.push({
        name: 'summary',
        content: latestSummary.summary,
      });
      layersIncluded.push('summary');
    }

    // 5. Memórias relevantes (consulta baseada na mensagem atual)
    const memories = await this.retrieval.searchRelevantMemories(
      projectId,
      currentMessage,
      this.contextConfig.memoryLimit,
    );
    if (memories.length) {
      layers.push({
        name: 'memories',
        content: memories
          .map((m) => `[importância ${m.importance}] ${m.title}: ${m.content}`)
          .join('\n'),
      });
      layersIncluded.push('memories');
    }

    // 6. Conhecimento do projeto (RAG)
    const ragChunks = await this.retrieval.searchRelevantChunks(
      projectId,
      currentMessage,
      this.contextConfig.ragChunkLimit,
    );
    if (ragChunks.length) {
      layers.push({
        name: 'rag',
        content: ragChunks.join('\n---\n'),
      });
      layersIncluded.push('rag');
    }

    // 7. Resultados recentes de tools
    const maxToolOutput =
      this.config.get<number>('tools.maxOutputChars') ?? 4000;
    const toolResultsLayer = this.buildToolResultsLayer(
      conversation.toolCalls,
      maxToolOutput,
    );
    if (toolResultsLayer) {
      layers.push({ name: 'tool_results', content: toolResultsLayer });
      layersIncluded.push('tool_results');
    }

    const systemContent = this.formatSystemContent(layers);

    // 4. Histórico recente (janela deslizante, excluindo mensagem atual)
    const recentMessages = this.buildRecentHistory(
      conversation.messages,
      latestSummary?.generatedUntilMessageId ?? null,
      currentMessage,
    );
    layersIncluded.push('recent_history');

    // 8. Mensagem atual
    const messages: ChatMessage[] = [
      ...recentMessages,
      { role: 'user', content: currentMessage },
    ];

    const metadata: ContextMetadata = {
      layersIncluded,
      estimatedTokens: estimateTokenCount(
        systemContent + messages.map((m) => m.content).join(''),
      ),
      summaryUsed,
      memoriesCount: memories.length,
      ragChunksCount: ragChunks.length,
      toolResultsCount: conversation.toolCalls.filter((t) => t.result).length,
      recentMessagesCount: recentMessages.length,
    };

    return { systemContent, messages, metadata };
  }

  private async buildProjectLayer(
    project: {
      name: string;
      description: string | null;
      rootPath: string | null;
    },
    settings: { key: string; value: string }[],
    projectId: string,
  ): Promise<string> {
    const highMemories = await this.prisma.memory.findMany({
      where: {
        projectId,
        active: true,
        importance: { gte: this.contextConfig.highImportanceThreshold },
      },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: 10,
    });

    const projectSettings = settings.filter(
      (s) => s.key.startsWith(`project:${projectId}:`) || s.key.startsWith('global:'),
    );

    const parts = [
      `Projeto: ${project.name}`,
      project.description ? `Descrição: ${project.description}` : null,
      project.rootPath
        ? `Diretório permitido (root_path): ${project.rootPath}`
        : null,
    ];

    if (projectSettings.length) {
      parts.push(
        'Configurações:',
        ...projectSettings.map((s) => `- ${s.key}: ${s.value}`),
      );
    }

    if (highMemories.length) {
      parts.push(
        'Memórias permanentes (alta importância):',
        ...highMemories.map(
          (m) => `- [${m.importance}] ${m.title}: ${m.content}`,
        ),
      );
    }

    return parts.filter(Boolean).join('\n');
  }

  private buildToolResultsLayer(
    toolCalls: {
      toolName: string;
      parameters: unknown;
      result: { output: string; success: boolean } | null;
    }[],
    maxOutputChars: number,
  ): string | null {
    const withResults = toolCalls.filter((t) => t.result);
    if (!withResults.length) return null;

    return withResults
      .map((t) => {
        const status = t.result!.success ? 'sucesso' : 'falha';
        let output = t.result!.output;
        if (output.length > maxOutputChars) {
          output = output.slice(0, maxOutputChars) + '\n...[truncado]';
        }
        return `Tool: ${t.toolName}(${JSON.stringify(t.parameters)})\nResultado (${status}):\n${output}`;
      })
      .join('\n\n');
  }

  private formatSystemContent(layers: ContextLayer[]): string {
    const sectionTitles: Record<string, string> = {
      system: 'Instruções do Sistema',
      project: 'Configuração do Projeto',
      summary: 'Resumo da Conversa',
      memories: 'Memórias Relevantes',
      rag: 'Conhecimento do Projeto',
      tool_results: 'Resultados Recentes de Tools',
    };

    return layers
      .map((layer) => {
        const title = sectionTitles[layer.name] ?? layer.name;
        return `## ${title}\n\n${layer.content}`;
      })
      .join('\n\n');
  }

  private buildRecentHistory(
    allMessages: { id: string; role: string; content: string }[],
    summaryUntilMessageId: string | null,
    currentMessage: string,
  ): ChatMessage[] {
    let eligible = allMessages;

    if (summaryUntilMessageId) {
      const cutoffIndex = eligible.findIndex(
        (m) => m.id === summaryUntilMessageId,
      );
      if (cutoffIndex >= 0) {
        eligible = eligible.slice(cutoffIndex + 1);
      }
    }

    // Remove a mensagem atual (última user) para não duplicar
    if (
      eligible.length > 0 &&
      eligible[eligible.length - 1].role === 'user' &&
      eligible[eligible.length - 1].content === currentMessage
    ) {
      eligible = eligible.slice(0, -1);
    }

    const window = this.contextConfig.recentMessagesWindow;
    const recent = eligible.slice(-window);

    return recent
      .filter((m) => ['user', 'assistant', 'system', 'tool'].includes(m.role))
      .map((m) => ({
        role: m.role as ChatMessage['role'],
        content: m.content,
      }));
  }
}
