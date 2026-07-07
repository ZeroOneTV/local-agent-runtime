import { Injectable, Logger } from '@nestjs/common';
import { ToolRouterService } from '../tools/tool-router.service';
import { OrchestratorConfigService } from './orchestrator.config';
import {
  ExecutionCycleResult,
  IntentAnalysis,
  READONLY_AUTO_TOOLS,
} from './orchestrator.types';

@Injectable()
export class ExecutionLoopService {
  private readonly logger = new Logger(ExecutionLoopService.name);
  private readonly executedKeys = new Set<string>();

  constructor(
    private readonly toolRouter: ToolRouterService,
    private readonly config: OrchestratorConfigService,
  ) {}

  async runCycle(params: {
    cycle: number;
    intent: IntentAnalysis;
    projectId: string;
    conversationId: string;
    message: string;
    userId?: string;
  }): Promise<ExecutionCycleResult> {
    const tools = params.intent.suggestedReadonlyTools.filter((t) =>
      READONLY_AUTO_TOOLS.includes(t),
    );

    const toolResults: ExecutionCycleResult['toolResults'] = [];
    const pendingApprovals: ExecutionCycleResult['pendingApprovals'] = [];
    let consecutiveTools = 0;

    for (const tool of tools.slice(0, this.config.maxConsecutiveTools)) {
      const args = this.buildToolArgs(tool, params.message);
      const key = `${tool}:${JSON.stringify(args)}`;

      if (this.executedKeys.has(key)) {
        this.logger.warn(`Tool repetida bloqueada: ${tool}`);
        continue;
      }

      if (consecutiveTools >= this.config.maxConsecutiveTools) break;

      const result = await this.toolRouter.route({
        tool,
        args,
        projectId: params.projectId,
        conversationId: params.conversationId,
        userId: params.userId,
        approved: true,
      });

      if (result.requiresApproval) {
        pendingApprovals.push({
          tool,
          message: result.message || 'Aprovação necessária',
          toolCallId: result.toolCallId,
        });
        continue;
      }

      this.executedKeys.add(key);
      consecutiveTools++;

      const summary = result.result
        ? JSON.stringify(result.result).slice(0, 500)
        : 'sem resultado';

      toolResults.push({
        tool,
        success: result.status === 'success',
        summary,
      });
    }

    return {
      cycle: params.cycle,
      toolResults,
      shouldContinue: toolResults.length > 0 && pendingApprovals.length === 0,
      pendingApprovals,
    };
  }

  resetSession() {
    this.executedKeys.clear();
  }

  private buildToolArgs(
    tool: string,
    message: string,
  ): Record<string, unknown> {
    switch (tool) {
      case 'search_files':
      case 'search_rag':
      case 'search_memories':
        return { query: message };
      case 'list_directory':
        return { path: '.' };
      case 'git_diff':
        return {};
      default:
        return {};
    }
  }
}
