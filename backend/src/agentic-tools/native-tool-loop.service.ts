import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChatMessage,
  LlmService,
  LlmToolCall,
} from '../llm/llm.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { ToolRouterService } from '../tools/tool-router.service';
import { StructuredToolResult } from '../tools/tools.types';
import { AgenticToolPolicyService } from './agentic-tool-policy.service';
import { ToolApprovalService } from './tool-approval.service';
import { ToolResultSummarizerService } from './tool-result-summarizer.service';
import { AgenticAction } from './types/agentic-action.types';

export interface NativeToolLoopInput {
  messages: ChatMessage[];
  systemContent: string;
  projectId: string;
  conversationId: string;
  userId?: string;
  projectRoot: string;
}

export interface NativeToolInvocation {
  tool: string;
  decision: string;
  success?: boolean;
  summary?: string;
  durationMs?: number;
  jobId?: string;
}

export interface NativeToolLoopResult {
  content: string;
  model: string;
  cyclesUsed: number;
  invocations: NativeToolInvocation[];
  pending: Array<{ tool: string; message: string; toolCallId?: string }>;
  /** Set when the model enqueued a long background job (enqueue_long_job). */
  jobId?: string;
}

/**
 * Generic native tool-use loop: the model decides which tools to call via
 * structured function-calling; this service asks the permission policy whether
 * each call auto-executes, needs approval, or is denied — no NL regex involved.
 * Gated by AGENTIC_NATIVE_TOOLCALLING (see CognitiveOrchestratorService).
 */
@Injectable()
export class NativeToolLoopService {
  private readonly logger = new Logger(NativeToolLoopService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly llm: LlmService,
    private readonly registry: ToolRegistryService,
    private readonly router: ToolRouterService,
    private readonly policy: AgenticToolPolicyService,
    private readonly approvals: ToolApprovalService,
    private readonly summarizer: ToolResultSummarizerService,
  ) {}

  get maxCycles(): number {
    return this.config.get<number>('cognitive.maxCycles') ?? 8;
  }

  /** Long background jobs are gated by COGNITIVE_ENABLE_LONG_JOBS. */
  get longJobsEnabled(): boolean {
    return this.config.get<boolean>('cognitive.enableLongJobs') ?? true;
  }

  async run(input: NativeToolLoopInput): Promise<NativeToolLoopResult> {
    const tools = this.longJobsEnabled
      ? this.registry.toOllamaTools()
      : this.registry
          .toOllamaTools()
          .filter((t) => t.function.name !== 'enqueue_long_job');
    const messages: ChatMessage[] = [...input.messages];
    const invocations: NativeToolInvocation[] = [];
    const pending: NativeToolLoopResult['pending'] = [];

    let content = '';
    let model = 'orchestrator-native';
    let cycle = 0;
    let finalized = false;

    while (cycle < this.maxCycles) {
      cycle++;

      const response = await this.llm.chat(messages, {
        systemContent: input.systemContent,
        tools,
      });
      model = response.model;
      content = response.content;

      const calls = response.toolCalls;
      if (!calls?.length) {
        // Model produced a final textual answer.
        finalized = true;
        break;
      }

      // Record the assistant turn (with its tool calls) in the transcript.
      messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: calls,
      });

      let hadPending = false;

      for (const call of calls) {
        const outcome = await this.handleToolCall(call, input);
        invocations.push(outcome.invocation);
        messages.push(outcome.toolMessage);
        if (outcome.pending) {
          pending.push(outcome.pending);
          hadPending = true;
        }
      }

      // If any call is awaiting human approval, stop and surface the request.
      if (hadPending) {
        finalized = true;
        if (!content) {
          content =
            'Preciso da sua aprovação para continuar com as ações acima.';
        }
        break;
      }
    }

    // Ran out of cycles while still calling tools (or no text yet): force a
    // final textual answer from the accumulated tool results, without tools.
    if (!finalized && (!content || pending.length === 0)) {
      try {
        const finalResponse = await this.llm.chat(messages, {
          systemContent: input.systemContent,
        });
        if (finalResponse.content) {
          content = finalResponse.content;
          model = finalResponse.model;
        }
      } catch (e) {
        this.logger.warn(
          `Final native answer failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const jobId = invocations.find((i) => i.jobId)?.jobId;

    return { content, model, cyclesUsed: cycle, invocations, pending, jobId };
  }

  private async handleToolCall(
    call: LlmToolCall,
    input: NativeToolLoopInput,
  ): Promise<{
    invocation: NativeToolInvocation;
    toolMessage: ChatMessage;
    pending?: { tool: string; message: string; toolCallId?: string };
  }> {
    const toolName = call.function.name;
    const args = call.function.arguments || {};
    const definition = this.registry.getDefinition(toolName);

    if (!definition) {
      const msg = `Tool desconhecida: ${toolName}`;
      return {
        invocation: { tool: toolName, decision: 'deny', success: false, summary: msg },
        toolMessage: this.toolMessage(call, toolName, msg),
      };
    }

    const action: AgenticAction = {
      type: 'tool_call',
      toolName,
      args,
      risk: definition.riskLevel,
      requiresApproval: definition.requiresApproval,
      path: (args.path as string) || undefined,
      command: (args.command as string) || undefined,
    };

    const decision = await this.policy.evaluate(action, {
      projectId: input.projectId,
      conversationId: input.conversationId,
      userId: input.userId,
      projectRoot: input.projectRoot,
    });

    this.logger.log(
      `native tool ${toolName} → ${decision.decision} (${decision.reason})`,
    );

    if (decision.decision === 'deny') {
      const msg = `Ação negada: ${decision.reason}`;
      return {
        invocation: { tool: toolName, decision: 'deny', success: false, summary: msg },
        toolMessage: this.toolMessage(call, toolName, msg),
      };
    }

    if (decision.decision === 'pending_approval' || decision.decision === 'skip') {
      const created = await this.approvals.createPending({
        action,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: input.userId,
        risk: decision.risk,
        reason: decision.reason,
        grantOptions: decision.grantOptions,
      });
      const msg = `Aguardando aprovação do usuário para ${toolName}.`;
      return {
        invocation: { tool: toolName, decision: decision.decision, summary: msg },
        toolMessage: this.toolMessage(call, toolName, msg),
        pending: { tool: toolName, message: created.message, toolCallId: created.toolCallId },
      };
    }

    // auto_execute
    const started = Date.now();
    let result: StructuredToolResult | undefined;
    let summary: string;
    let success = false;
    let jobId: string | undefined;
    try {
      const routed = await this.router.route({
        tool: toolName,
        args,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: input.userId,
        approved: true,
      });
      result = routed.result;
      jobId = routed.jobId;
      success = routed.status === 'success' || routed.status === 'running';
      summary = result
        ? this.summarizer.summarize(toolName, result)
        : routed.message || 'sem resultado';
    } catch (e) {
      summary = `Erro ao executar ${toolName}: ${e instanceof Error ? e.message : String(e)}`;
    }

    return {
      invocation: {
        tool: toolName,
        decision: 'auto_execute',
        success,
        summary,
        durationMs: Date.now() - started,
        jobId,
      },
      toolMessage: this.toolMessage(call, toolName, summary),
    };
  }

  private toolMessage(
    call: LlmToolCall,
    toolName: string,
    content: string,
  ): ChatMessage {
    return {
      role: 'tool',
      name: toolName,
      tool_call_id: call.id,
      content,
    };
  }
}
