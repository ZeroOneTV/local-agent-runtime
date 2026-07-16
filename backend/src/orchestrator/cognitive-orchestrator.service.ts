import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ContextService } from '../context/context.service';
import { LlmService } from '../llm/llm.service';
import { PromptTemplateService } from '../llm/prompts/prompt-template.service';
import { SummaryService } from '../context/summary.service';
import { IntentAnalyzerService } from './intent-analyzer.service';
import { MemoryDecisionService } from './memory-decision.service';
import { EventService } from './event.service';
import { OrchestratorConfigService } from './orchestrator.config';
import { WorkingMemoryService } from '../memory-stratification/working-memory.service';
import { MemoryEtlService } from '../memory-stratification/memory-etl.service';
import {
  NativeToolLoopService,
  NativeToolLoopEvent,
} from '../agentic-tools/native-tool-loop.service';
import { AgenticToolPolicyService } from '../agentic-tools/agentic-tool-policy.service';
import { HostFilesystemDiscoveryService } from '../local-filesystem/host-filesystem-discovery.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
import {
  ExecutionCycleResult,
  OrchestratorResult,
} from './orchestrator.types';

export interface ProcessMessageInput {
  conversationId: string;
  projectId: string;
  message: string;
  userId?: string;
  debug?: boolean;
  /**
   * Optional real-time progress callback, forwarded to the native tool loop so
   * the streaming controller can surface text/tool activity as it happens.
   * Purely a pipe — no business logic depends on it.
   */
  onEvent?: (event: NativeToolLoopEvent) => void;
}

@Injectable()
export class CognitiveOrchestratorService {
  private readonly logger = new Logger(CognitiveOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ContextService,
    private readonly llm: LlmService,
    private readonly summary: SummaryService,
    private readonly intentAnalyzer: IntentAnalyzerService,
    private readonly memoryDecision: MemoryDecisionService,
    private readonly events: EventService,
    private readonly config: OrchestratorConfigService,
    private readonly workingMemory: WorkingMemoryService,
    private readonly memoryEtl: MemoryEtlService,
    private readonly nativeToolLoop: NativeToolLoopService,
    private readonly agenticPolicy: AgenticToolPolicyService,
    private readonly discovery: HostFilesystemDiscoveryService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly promptTemplates: PromptTemplateService,
  ) {}

  async processMessage(input: ProcessMessageInput): Promise<OrchestratorResult> {
    const startedAt = Date.now();
    const timings: Record<string, number> = {};
    const eventIds: string[] = [];

    // Regex intent is kept only as cheap, non-blocking telemetry — it no longer
    // decides which tools run. The model drives that via native tool-calling.
    const intent = this.intentAnalyzer.analyze(input.message);
    timings.intentMs = Date.now() - startedAt;
    this.logger.log(`Intent: ${intent.intent}, flow: ${intent.flow}`);

    const taskStarted = await this.events.emit(
      'task.started',
      input.projectId,
      input.conversationId,
      { intent: intent.intent, flow: intent.flow },
    );
    if (taskStarted) eventIds.push(taskStarted);

    await this.workingMemory.updateConversation(input.conversationId, {
      currentGoal: input.message.slice(0, 200),
    });
    await this.events.emit('memory.working.updated', input.projectId, input.conversationId, {
      currentGoal: input.message.slice(0, 200),
    });

    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    const projectRoot = project?.rootPath || '';

    // Emergency switch: with AGENTIC_NATIVE_TOOLCALLING=false, skip the tool loop
    // entirely and answer with a plain chat (useful to debug the model in
    // isolation). Default is on — the model drives tools via function-calling.
    if (!this.config.nativeToolCalling) {
      return this.processMessageSimple(input, intent, {
        startedAt,
        timings,
        eventIds,
      });
    }

    return this.processMessageNative(input, intent, projectRoot, {
      startedAt,
      timings,
      eventIds,
    });
  }

  /**
   * Plain chat without any tools. Used when native tool-calling is disabled via
   * the AGENTIC_NATIVE_TOOLCALLING flag (emergency/debug path).
   */
  private async processMessageSimple(
    input: ProcessMessageInput,
    intent: OrchestratorResult['intent'],
    ctx: { startedAt: number; timings: Record<string, number>; eventIds: string[] },
  ): Promise<OrchestratorResult> {
    const built = await this.context.build({
      conversationId: input.conversationId,
      projectId: input.projectId,
      currentMessage: input.message,
    });

    let content: string;
    let model: string;
    const llmStarted = Date.now();
    try {
      const response = await this.llm.chat(built.messages, {
        systemContent: built.systemContent,
      });
      content = response.content;
      model = response.model;
    } catch (error) {
      this.logger.error('Simple chat failed', error as Error);
      content = this.buildLlmUnavailableResponse(intent, '', []);
      model = 'orchestrator-fallback';
    }
    ctx.timings.llmMs = Date.now() - llmStarted;
    ctx.timings.totalMs = Date.now() - ctx.startedAt;

    const memorySuggestions = this.memoryDecision.extractSuggestions(
      input.message,
      content,
    );
    await this.summary.updateIfNeeded(input.conversationId);

    return {
      content,
      model,
      intent,
      cycles: [],
      events: ctx.eventIds,
      memorySuggestions,
      pendingApprovals: [],
      contextMetadata: built.metadata as unknown as Record<string, unknown>,
    };
  }

  /**
   * Native tool-calling path: build context, run the generic agent loop, and
   * persist the result. Approval decisions are delegated to the policy service.
   */
  private async processMessageNative(
    input: ProcessMessageInput,
    intent: OrchestratorResult['intent'],
    projectRoot: string,
    ctx: { startedAt: number; timings: Record<string, number>; eventIds: string[] },
  ): Promise<OrchestratorResult> {
    const built = await this.context.build({
      conversationId: input.conversationId,
      projectId: input.projectId,
      currentMessage: input.message,
    });

    const systemContent = [
      built.systemContent,
      this.buildNativeSystemPrompt(),
    ].join('\n\n');

    let loop: Awaited<ReturnType<NativeToolLoopService['run']>>;
    const llmStarted = Date.now();
    try {
      loop = await this.nativeToolLoop.run({
        messages: built.messages,
        systemContent,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: input.userId,
        projectRoot,
        onEvent: input.onEvent,
      });
    } catch (error) {
      this.logger.error('Native tool loop failed', error as Error);
      const content = this.buildLlmUnavailableResponse(intent, '', []);
      return {
        content,
        model: 'orchestrator-fallback',
        intent,
        cycles: [],
        events: ctx.eventIds,
        memorySuggestions: [],
        pendingApprovals: [],
        contextMetadata: {},
      };
    }
    ctx.timings.llmMs = Date.now() - llmStarted;
    ctx.timings.totalMs = Date.now() - ctx.startedAt;

    let finalContent = loop.content;
    const pendingApprovals: OrchestratorResult['pendingApprovals'] = loop.pending.map(
      (p) => ({ tool: p.tool, message: p.message, toolCallId: p.toolCallId }),
    );
    if (pendingApprovals.length) {
      finalContent +=
        '\n\n## Aprovações pendentes\n\n' +
        pendingApprovals.map((p) => p.message).join('\n\n');
    }

    // Note: the assistant message is persisted by the caller (controller),
    // consistent with the non-native path.

    // Surface tool activity through the same channel the OpenWebUI stream reads
    // (result.cycles) so the "Tools executadas" status also works natively.
    const executedInvocations = loop.invocations.filter(
      (i) => i.decision === 'auto_execute',
    );
    const nativeCycles: ExecutionCycleResult[] = executedInvocations.length
      ? [
          {
            cycle: 1,
            toolResults: executedInvocations.map((i) => ({
              tool: i.tool,
              success: i.success !== false,
              summary: i.summary || '',
            })),
            shouldContinue: false,
            pendingApprovals,
          },
        ]
      : [];

    for (const inv of loop.invocations) {
      await this.events.emit(
        inv.success === false ? 'tool.failed' : 'tool.completed',
        input.projectId,
        input.conversationId,
        { tool: inv.tool, decision: inv.decision },
      );
    }

    const memorySuggestions = this.memoryDecision.extractSuggestions(
      input.message,
      finalContent,
    );
    await this.summary.updateIfNeeded(input.conversationId);
    await this.memoryEtl.extractFromConversationTurn({
      projectId: input.projectId,
      conversationId: input.conversationId,
      userMessage: input.message,
      assistantResponse: finalContent,
      toolSummaries: loop.invocations.map(
        (i) => `${i.tool}: ${(i.summary || '').slice(0, 120)}`,
      ),
    });

    const completedEvent = await this.events.emit(
      'task.completed',
      input.projectId,
      input.conversationId,
      { intent: intent.intent, cycles: loop.cyclesUsed, native: true },
    );
    if (completedEvent) ctx.eventIds.push(completedEvent);

    const debug =
      input.debug || this.config.debug
        ? {
            intent,
            nativeToolCalling: true,
            executionMode: this.agenticPolicy.executionMode,
            cyclesUsed: loop.cyclesUsed,
            invocations: loop.invocations,
            timingsMs: ctx.timings,
          }
        : undefined;

    return {
      content: finalContent,
      model: loop.model,
      intent,
      cycles: nativeCycles,
      events: ctx.eventIds,
      memorySuggestions,
      jobId: loop.jobId,
      pendingApprovals,
      contextMetadata: built.metadata as unknown as Record<string, unknown>,
      debug,
    };
  }

  /** Dynamic system instruction reflecting the real execution mode. */
  private buildNativeSystemPrompt(): string {
    const mode = this.agenticPolicy.executionMode;
    // Parte customizável (persona + orientação de tools) vem de arquivos
    // editáveis com fallback embutido. Daqui pra baixo é estado real do
    // sistema (modo, pastas descobertas) e continua gerado em código.
    const lines = [
      this.promptTemplates.getPersona(),
      this.promptTemplates.getToolGuidance(),
    ];
    if (mode === 'safe') {
      lines.push('Modo atual: SAFE — apenas leitura executa automaticamente; escrita/execução será revisada por um humano.');
    } else if (mode === 'autonomous') {
      lines.push('Modo atual: AUTÔNOMO — leitura e também escrita/execução dentro da pasta do projeto rodam automaticamente; ações fora dela ou destrutivas ainda pedem aprovação.');
    } else {
      lines.push('Modo atual: ASSISTIDO — leitura roda automaticamente; escrita/execução pede aprovação.');
    }

    // Announce internet capability only when the tools are actually available,
    // so the model doesn't try to use a capability that's turned off.
    const available = new Set(
      this.toolRegistry.availableDefinitions().map((d) => d.name),
    );
    if (available.has('web_search')) {
      lines.push('');
      lines.push(
        'Você tem acesso a busca na internet (web_search)' +
          (available.has('fetch_url') ? ' e a leitura de páginas web (fetch_url)' : '') +
          '. Use quando não souber algo ou precisar comparar informação pública; ' +
          'nunca use para decidir ações destrutivas sozinho.',
      );
    } else if (available.has('fetch_url')) {
      lines.push('');
      lines.push(
        'Você pode ler páginas web públicas com fetch_url quando tiver uma URL. Use com parcimônia.',
      );
    }

    // Give the model the real absolute paths for this machine's personal folders
    // so it can call filesystem tools directly (no NL path guessing).
    const known = this.discovery.listKnownFolders();
    if (known.length) {
      lines.push('');
      lines.push(
        'Caminhos reais deste computador — use exatamente estes como argumento `path` (absoluto) nas tools de filesystem:',
      );
      for (const f of known) {
        lines.push(`- ${f.label}: ${f.path}`);
      }
      lines.push(
        'Ex.: para "meus documentos do Windows", chame list_directory com o path de "Documentos" acima. Nunca invente caminho nem use path relativo para pastas pessoais.',
      );
      lines.push(
        'Essas são as únicas pastas pessoais conhecidas neste computador. Não invente nem deduza outros caminhos (ex.: uma pasta "Games", "Músicas de trabalho", etc.) por analogia — se o usuário mencionar algo que não está nessa lista e for necessário localizar, pergunte o caminho em vez de adivinhar.',
      );
    }

    return lines.join('\n');
  }

  private buildLlmUnavailableResponse(
    intent: OrchestratorResult['intent'],
    toolContext: string,
    pendingApprovals: OrchestratorResult['pendingApprovals'],
  ): string {
    const parts = [
      'O modelo de linguagem local não está disponível no momento.',
      `Intenção detectada: **${intent.intent}** (fluxo: ${intent.flow}).`,
    ];

    if (toolContext) {
      parts.push('**Resultados parciais de tools:**');
      parts.push(toolContext.slice(0, 2000));
    }

    if (pendingApprovals.length) {
      parts.push('**Aprovações pendentes:**');
      parts.push(pendingApprovals.map((p) => p.message).join('\n'));
    }

    parts.push('Verifique se o Ollama está rodando e acessível em LLM_BASE_URL.');
    return parts.join('\n\n');
  }
}
