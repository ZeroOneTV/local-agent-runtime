import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ContextService } from '../context/context.service';
import { LlmService } from '../llm/llm.service';
import { SummaryService } from '../context/summary.service';
import { ConversationsService } from '../conversations/conversations.service';
import { IntentAnalyzerService } from './intent-analyzer.service';
import { PlannerService } from './planner.service';
import { ExecutionLoopService } from './execution-loop.service';
import { ReflectionService } from './reflection.service';
import { MemoryDecisionService } from './memory-decision.service';
import { EventService } from './event.service';
import { OrchestratorConfigService } from './orchestrator.config';
import { JobsService } from '../jobs/jobs.service';
import { WorkingMemoryService } from '../memory-stratification/working-memory.service';
import { MemoryEtlService } from '../memory-stratification/memory-etl.service';
import {
  ExecutionCycleResult,
  OrchestratorPlan,
  OrchestratorResult,
} from './orchestrator.types';

const ASSISTED_EXECUTOR_PROMPT = `Você é um assistente local em modo Executor Assistido.
Regras:
- Responda em português de forma clara e objetiva.
- Descreva o que foi analisado e executado quando relevante.
- Liste limitações e próximos passos quando aplicável.
- NÃO revele cadeia de pensamento interna detalhada.
- Mostre plano e etapas quando existirem, de forma resumida.
- Se houver pendências de aprovação, informe claramente.
- Nunca execute ações destrutivas sem aprovação explícita.`;

export interface ProcessMessageInput {
  conversationId: string;
  projectId: string;
  message: string;
  userId?: string;
  debug?: boolean;
}

@Injectable()
export class CognitiveOrchestratorService {
  private readonly logger = new Logger(CognitiveOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversations: ConversationsService,
    private readonly context: ContextService,
    private readonly llm: LlmService,
    private readonly summary: SummaryService,
    private readonly intentAnalyzer: IntentAnalyzerService,
    private readonly planner: PlannerService,
    private readonly executionLoop: ExecutionLoopService,
    private readonly reflection: ReflectionService,
    private readonly memoryDecision: MemoryDecisionService,
    private readonly events: EventService,
    private readonly config: OrchestratorConfigService,
    @Inject(forwardRef(() => JobsService))
    private readonly jobs: JobsService,
    private readonly workingMemory: WorkingMemoryService,
    private readonly memoryEtl: MemoryEtlService,
  ) {}

  async processMessage(input: ProcessMessageInput): Promise<OrchestratorResult> {
    const startedAt = Date.now();
    const timings: Record<string, number> = {};
    const eventIds: string[] = [];
    const cycles: ExecutionCycleResult[] = [];
    const pendingApprovals: OrchestratorResult['pendingApprovals'] = [];

    this.executionLoop.resetSession();

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

    let plan: OrchestratorPlan | undefined;
    let jobId: string | undefined;
    let toolContext = '';

    if (intent.flow === 'long_job' && this.config.enableLongJobs) {
      const job = await this.jobs.createAndEnqueue({
        projectId: input.projectId,
        conversationId: input.conversationId,
        message: input.message,
        intentType: intent.intent,
      });
      jobId = job.id;

      plan = await this.planner.createPlan(input.message, intent);

      const jobResponse = [
        'Identifiquei uma tarefa de longa duração.',
        `Job criado: ${jobId}`,
        '',
        `**Plano:** ${plan.objective}`,
        plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
        '',
        'Você será notificado quando concluir. Acompanhe em /orchestrator/events.',
      ].join('\n');

      const assistantMessage = await this.conversations.addMessage(
        input.conversationId,
        'assistant',
        jobResponse,
      );

      await this.events.emit('task.completed', input.projectId, input.conversationId, {
        jobId,
        status: 'pending',
      });

      return {
        content: jobResponse,
        model: 'orchestrator',
        intent,
        plan,
        cycles,
        events: eventIds,
        memorySuggestions: [],
        jobId,
        pendingApprovals: [],
        contextMetadata: {},
      };
    }

    if (intent.needsPlan) {
      plan = await this.planner.createPlan(input.message, intent);
    }

    if (intent.needsTools && intent.flow !== 'direct') {
      const toolsStarted = Date.now();
      let cycle = 1;
      let shouldContinue = true;

      while (shouldContinue && cycle <= this.config.maxCycles) {
        const cycleResult = await this.executionLoop.runCycle({
          cycle,
          intent,
          projectId: input.projectId,
          conversationId: input.conversationId,
          message: input.message,
          userId: input.userId,
        });

        cycles.push(cycleResult);
        pendingApprovals.push(...cycleResult.pendingApprovals);

        for (const tr of cycleResult.toolResults) {
          await this.events.emit(
            tr.success ? 'tool.completed' : 'tool.failed',
            input.projectId,
            input.conversationId,
            { tool: tr.tool },
          );
        }

        for (const pa of cycleResult.pendingApprovals) {
          await this.events.emit('tool.pending_approval', input.projectId, input.conversationId, pa);
        }

        toolContext += cycleResult.toolResults
          .map((t) => `### ${t.tool}\n${t.summary}`)
          .join('\n\n');

        const reflection = await this.reflection.reflect({
          userMessage: input.message,
          toolResults: cycleResult.toolResults,
          cycle,
          maxCycles: this.config.maxCycles,
          pendingApprovals: cycleResult.pendingApprovals.length,
        });

        shouldContinue = reflection.shouldContinue && cycle < this.config.maxCycles;
        if (!shouldContinue) break;
        cycle++;
      }
      timings.toolsMs = Date.now() - toolsStarted;
    }

    const contextStarted = Date.now();
    const built = await this.context.build({
      conversationId: input.conversationId,
      projectId: input.projectId,
      currentMessage: input.message,
    });
    timings.contextMs = Date.now() - contextStarted;

    const systemParts = [built.systemContent, ASSISTED_EXECUTOR_PROMPT];

    if (plan) {
      systemParts.push(`## Plano de execução\n\n${this.planner.formatPlanForContext(plan)}`);
    }

    if (toolContext) {
      systemParts.push(`## Resultados de tools automáticas\n\n${toolContext}`);
    }

    if (pendingApprovals.length) {
      systemParts.push(
        `## Aprovações pendentes\n\n${pendingApprovals.map((p) => p.message).join('\n')}`,
      );
    }

    let response: { content: string; model: string };
    const llmStarted = Date.now();
    try {
      response = await this.llm.chat(built.messages, systemParts.join('\n\n'));
    } catch {
      response = {
        content: this.buildLlmUnavailableResponse(intent, plan, toolContext, pendingApprovals),
        model: 'orchestrator-fallback',
      };
    }
    timings.llmMs = Date.now() - llmStarted;
    timings.totalMs = Date.now() - startedAt;

    let finalContent = response.content;

    const memorySuggestions = this.memoryDecision.extractSuggestions(
      input.message,
      finalContent,
    );

    for (const suggestion of memorySuggestions) {
      await this.events.emit('memory.consolidation.suggested', input.projectId, input.conversationId, suggestion);
      await this.events.emit('memory.suggested', input.projectId, input.conversationId, suggestion);
      if (this.config.requireMemoryConfirmation) {
        finalContent += `\n\n---\n${this.memoryDecision.formatSuggestionMessage(suggestion)}`;
      }
    }

    await this.summary.updateIfNeeded(input.conversationId);

    const recent = await this.memoryEtl.extractFromConversationTurn({
      projectId: input.projectId,
      conversationId: input.conversationId,
      userMessage: input.message,
      assistantResponse: finalContent,
      toolSummaries: cycles.flatMap((c) =>
        c.toolResults.map((t) => `${t.tool}: ${t.summary.slice(0, 120)}`),
      ),
    });
    if (recent) {
      await this.events.emit('memory.recent.created', input.projectId, input.conversationId, {
        id: recent.id,
        title: recent.title,
      });
    }

    const completedEvent = await this.events.emit(
      'task.completed',
      input.projectId,
      input.conversationId,
      { intent: intent.intent, cycles: cycles.length },
    );
    if (completedEvent) eventIds.push(completedEvent);

    const debugInfo =
      input.debug || this.config.debug
        ? {
            intent,
            plan,
            cycles,
            contextLayers: built.metadata.layersIncluded,
            estimatedTokens: built.metadata.estimatedTokens,
            memoriesCount: built.metadata.memoriesCount,
            ragChunksCount: built.metadata.ragChunksCount,
            toolResultsCount: built.metadata.toolResultsCount,
            truncatedForBudget: built.metadata.truncatedForBudget,
            ragSkipped: built.metadata.ragSkipped,
            deepMemorySkipped: built.metadata.deepMemorySkipped,
            timingsMs: {
              ...timings,
              memoryMs: built.metadata.memoryMs,
              ragMs: built.metadata.ragMs,
            },
            context: {
              tokensEstimated: built.metadata.estimatedTokens,
              ragSkipped: built.metadata.ragSkipped,
              deepMemorySkipped: built.metadata.deepMemorySkipped,
            },
          }
        : undefined;

    return {
      content: finalContent,
      model: response.model,
      intent,
      plan,
      cycles,
      events: eventIds,
      memorySuggestions,
      jobId,
      pendingApprovals,
      contextMetadata: built.metadata as unknown as Record<string, unknown>,
      debug: debugInfo,
    };
  }

  private buildLlmUnavailableResponse(
    intent: OrchestratorResult['intent'],
    plan: OrchestratorPlan | undefined,
    toolContext: string,
    pendingApprovals: OrchestratorResult['pendingApprovals'],
  ): string {
    const parts = [
      'O modelo de linguagem local não está disponível no momento.',
      `Intenção detectada: **${intent.intent}** (fluxo: ${intent.flow}).`,
    ];

    if (plan) {
      parts.push(`**Plano:** ${plan.objective}`);
      parts.push(plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'));
    }

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
