import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { RetrievalService } from '../rag/retrieval.service';
import { ContextConfigService } from './context.config';
import { MediaService } from '../media/media.service';
import { MemoryRetrievalRouterService } from '../memory-stratification/memory-retrieval-router.service';
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
import {
  deduplicateLines,
  filterDuplicateMemories,
  shouldSearchRag,
} from './context-dedup.util';
import { trimLayersToTokenBudget, trimMessagesToTokenBudget } from './context-budget.util';

@Injectable()
export class ContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
    private readonly contextConfig: ContextConfigService,
    private readonly config: ConfigService,
    private readonly media: MediaService,
    private readonly memoryRouter: MemoryRetrievalRouterService,
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
    let deduplicated = false;
    let ragSkipped = false;

    layers.push({
      name: 'system',
      content: [SYSTEM_PROMPT, TOOL_USE_PROMPT].join('\n\n'),
    });
    layersIncluded.push('system');

    const projectLayer = await this.buildProjectLayer(project, settings, projectId);

    if (projectLayer) {
      layers.push({ name: 'project', content: projectLayer });
      layersIncluded.push('project');
    }

    const memoryStarted = Date.now();
    const memoryResult = await this.memoryRouter.retrieve({
      projectId,
      conversationId,
      query: currentMessage,
    });
    const memoryMs = Date.now() - memoryStarted;
    const deepMemorySkipped = memoryResult.metadata.skippedLayers.includes('deep');
    const memoryLayers = this.memoryRouter.formatLayersForContext(memoryResult);

    if (memoryLayers.working) {
      layers.push({ name: 'working_memory', content: memoryLayers.working });
      layersIncluded.push('working_memory');
    }

    if (memoryLayers.recent) {
      layers.push({ name: 'recent_memory', content: memoryLayers.recent });
      layersIncluded.push('recent_memory');
    }

    const latestSummary = conversation.summaries[0];
    const summaryUsed = !!latestSummary;
    if (latestSummary) {
      layers.push({
        name: 'summary',
        content: latestSummary.summary,
      });
      layersIncluded.push('summary');
    }

    const consolidatedContent =
      memoryLayers.consolidated ??
      (await this.buildLegacyMemoriesLayer(projectId, currentMessage, projectLayer || ''));
    if (consolidatedContent) {
      layers.push({ name: 'memories', content: consolidatedContent });
      layersIncluded.push('memories');
    }

    const useRag =
      !this.contextConfig.skipRagForCasual || shouldSearchRag(currentMessage);
    let ragChunks: string[] = [];
    let ragMs = 0;
    if (useRag) {
      const ragStarted = Date.now();
      ragChunks = await this.retrieval.searchRelevantChunks(
        projectId,
        currentMessage,
        this.contextConfig.ragChunkLimit,
      );
      ragMs = Date.now() - ragStarted;
    } else {
      ragSkipped = true;
    }

    if (ragChunks.length) {
      let ragContent = ragChunks.join('\n---\n');
      if (latestSummary) {
        const deduped = deduplicateLines(latestSummary.summary, ragContent);
        if (deduped.length < ragContent.length) deduplicated = true;
        ragContent = deduped;
      }
      if (ragContent.trim()) {
        layers.push({ name: 'rag', content: ragContent });
        layersIncluded.push('rag');
      }
    }

    const mediaContext = await this.media.getConversationMediaContext(conversationId);
    if (mediaContext) {
      layers.push({ name: 'media', content: mediaContext });
      layersIncluded.push('media');
    }

    if (memoryLayers.deep) {
      layers.push({ name: 'deep_memory', content: memoryLayers.deep });
      layersIncluded.push('deep_memory');
    }

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

    const budgetTrim = trimLayersToTokenBudget(
      layers,
      this.contextConfig.maxContextTokens,
    );
    const finalLayers = budgetTrim.layers;
    let truncatedForBudget = budgetTrim.truncated;
    if (budgetTrim.truncated) {
      layersIncluded.splice(0, layersIncluded.length, ...finalLayers.map((l) => l.name));
    }

    const systemContent = this.formatSystemContent(finalLayers);

    let recentMessages = this.buildRecentHistory(
      conversation.messages,
      latestSummary?.generatedUntilMessageId ?? null,
      currentMessage,
    );
    layersIncluded.push('recent_history');

    const recentTrim = trimMessagesToTokenBudget(
      recentMessages,
      this.contextConfig.maxRecentTokens,
    );
    recentMessages = recentTrim.messages;
    if (recentTrim.truncated) truncatedForBudget = true;

    const messages: ChatMessage[] = [
      ...recentMessages,
      { role: 'user', content: currentMessage },
    ];

    const totalTokens = estimateTokenCount(
      systemContent + messages.map((m) => m.content).join(''),
    );
    if (totalTokens > this.contextConfig.maxContextTokens) {
      const msgTrim = trimMessagesToTokenBudget(
        messages.slice(0, -1),
        Math.floor(this.contextConfig.maxContextTokens * 0.3),
      );
      const rebuilt: ChatMessage[] = [
        ...msgTrim.messages,
        { role: 'user', content: currentMessage },
      ];
      truncatedForBudget = true;
      return this.finalize(
        systemContent,
        rebuilt,
        {
          layersIncluded,
          estimatedTokens: estimateTokenCount(
            systemContent + rebuilt.map((m) => m.content).join(''),
          ),
          summaryUsed,
          memoriesCount: consolidatedContent ? consolidatedContent.split('\n').length : 0,
          ragChunksCount: ragChunks.length,
          toolResultsCount: conversation.toolCalls.filter((t) => t.result).length,
          recentMessagesCount: msgTrim.messages.length,
          truncatedForBudget,
          ragSkipped,
          deduplicated,
          deepMemorySkipped,
          memoryMs,
          ragMs,
        },
      );
    }

    const metadata: ContextMetadata = {
      layersIncluded,
      estimatedTokens: totalTokens,
      summaryUsed,
      memoriesCount: consolidatedContent ? consolidatedContent.split('\n').length : 0,
      ragChunksCount: ragChunks.length,
      toolResultsCount: conversation.toolCalls.filter((t) => t.result).length,
      recentMessagesCount: recentMessages.length,
      truncatedForBudget: truncatedForBudget || undefined,
      ragSkipped: ragSkipped || undefined,
      deepMemorySkipped: deepMemorySkipped || undefined,
      deduplicated: deduplicated || undefined,
      memoryMs,
      ragMs: ragMs || undefined,
    };

    return { systemContent, messages, metadata };
  }

  private async buildLegacyMemoriesLayer(
    projectId: string,
    currentMessage: string,
    projectLayer: string,
  ): Promise<string | null> {
    const rawMemories = await this.retrieval.searchRelevantMemories(
      projectId,
      currentMessage,
      this.contextConfig.memoryLimit,
    );
    const memories = filterDuplicateMemories(projectLayer, rawMemories);
    if (!memories.length) return null;
    return memories
      .map((m) => `[importância ${m.importance}] ${m.title}: ${m.content}`)
      .join('\n');
  }

  private finalize(
    systemContent: string,
    messages: ChatMessage[],
    metadata: ContextMetadata,
  ): BuiltContext {
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
      result: { output: string; success: boolean; artifactPath?: string | null } | null;
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
        const artifactNote = t.result!.artifactPath
          ? `\n(artifact completo: ${t.result!.artifactPath})`
          : '';
        return `Tool: ${t.toolName}(${JSON.stringify(t.parameters)})\nResultado (${status}):\n${output}${artifactNote}`;
      })
      .join('\n\n');
  }

  private formatSystemContent(layers: ContextLayer[]): string {
    const sectionTitles: Record<string, string> = {
      system: 'Instruções do Sistema',
      project: 'Configuração do Projeto',
      working_memory: 'Memória de Trabalho',
      recent_memory: 'Memória Recente',
      summary: 'Resumo da Conversa',
      memories: 'Memórias Relevantes',
      rag: 'Conhecimento do Projeto',
      media: 'Contexto de Mídia (Imagens)',
      deep_memory: 'Memória Profunda',
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

    if (
      eligible.length > 0 &&
      eligible[eligible.length - 1].role === 'user' &&
      eligible[eligible.length - 1].content === currentMessage
    ) {
      eligible = eligible.slice(0, -1);
    }

    const window = this.contextConfig.recentMessagesWindow;
    let recent = eligible.slice(-window);

    const maxRecentTokens = this.contextConfig.maxRecentTokens;
    while (
      recent.length > 1 &&
      estimateTokenCount(recent.map((m) => m.content).join('')) > maxRecentTokens
    ) {
      recent = recent.slice(1);
    }

    return recent
      .filter((m) => ['user', 'assistant', 'system', 'tool'].includes(m.role))
      .map((m) => ({
        role: m.role as ChatMessage['role'],
        content: m.content,
      }));
  }
}
