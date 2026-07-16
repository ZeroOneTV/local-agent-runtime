import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolRouterService } from '../tools/tool-router.service';
import { ToolResultSummarizerService } from './tool-result-summarizer.service';
import { AgenticAction } from './types/agentic-action.types';

@Injectable()
export class ToolAutoExecutionService {
  private readonly logger = new Logger(ToolAutoExecutionService.name);
  private callsThisTurn = 0;

  constructor(
    private readonly toolRouter: ToolRouterService,
    private readonly summarizer: ToolResultSummarizerService,
    private readonly config: ConfigService,
  ) {}

  resetTurn() {
    this.callsThisTurn = 0;
  }

  get maxCallsPerTurn(): number {
    return this.config.get<number>('agentic.autoToolMaxCallsPerTurn') ?? 3;
  }

  canExecuteMore(): boolean {
    return this.callsThisTurn < this.maxCallsPerTurn;
  }

  async execute(params: {
    action: AgenticAction;
    projectId: string;
    conversationId: string;
    userId?: string;
    approved?: boolean;
  }): Promise<{
    success: boolean;
    summary: string;
    toolCallId?: string;
    status: string;
    requiresApproval?: boolean;
    message?: string;
    durationMs: number;
  }> {
    if (!this.canExecuteMore() && !params.approved) {
      return {
        success: false,
        summary: 'Limite de auto-tools por turno excedido',
        status: 'error',
        durationMs: 0,
      };
    }

    const started = Date.now();
    this.callsThisTurn++;

    const timeoutMs = this.config.get<number>('agentic.autoToolTimeoutMs') ?? 30000;

    try {
      const result = await Promise.race([
        this.toolRouter.route({
          tool: params.action.toolName,
          args: params.action.args,
          projectId: params.projectId,
          conversationId: params.conversationId,
          userId: params.userId,
          approved: params.approved ?? true,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AUTO_TOOL_TIMEOUT')), timeoutMs),
        ),
      ]);

      if (result.requiresApproval) {
        return {
          success: false,
          summary: result.message || 'Aprovação necessária',
          toolCallId: result.toolCallId,
          status: 'pending',
          requiresApproval: true,
          message: result.message,
          durationMs: Date.now() - started,
        };
      }

      const summary = result.result
        ? this.summarizer.summarize(params.action.toolName, result.result)
        : result.message || 'sem resultado';

      this.logger.log(
        `Auto-executed ${params.action.toolName} in ${Date.now() - started}ms`,
      );

      return {
        success: result.status === 'success',
        summary,
        toolCallId: result.toolCallId,
        status: result.status,
        durationMs: Date.now() - started,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        summary: message,
        status: 'error',
        durationMs: Date.now() - started,
      };
    }
  }
}
