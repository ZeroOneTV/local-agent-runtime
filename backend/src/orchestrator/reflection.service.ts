import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { OrchestratorConfigService } from './orchestrator.config';
import { ExecutionCycleResult } from './orchestrator.types';

export interface ReflectionInput {
  userMessage: string;
  toolResults: { tool: string; success: boolean; summary: string }[];
  cycle: number;
  maxCycles: number;
  pendingApprovals: number;
}

export interface ReflectionResult {
  shouldContinue: boolean;
  stopReason?: string;
  needsMoreContext: boolean;
  planStillValid: boolean;
}

@Injectable()
export class ReflectionService {
  constructor(
    private readonly config: OrchestratorConfigService,
    private readonly llm: LlmService,
  ) {}

  async reflect(input: ReflectionInput): Promise<ReflectionResult> {
    if (!this.config.enableReflection) {
      return {
        shouldContinue: false,
        stopReason: 'reflection_disabled',
        needsMoreContext: false,
        planStillValid: true,
      };
    }

    if (input.pendingApprovals > 0) {
      return {
        shouldContinue: false,
        stopReason: 'approval_required',
        needsMoreContext: false,
        planStillValid: true,
      };
    }

    if (input.cycle >= input.maxCycles) {
      return {
        shouldContinue: false,
        stopReason: 'max_cycles',
        needsMoreContext: false,
        planStillValid: true,
      };
    }

    const failedTools = input.toolResults.filter((t) => !t.success);
    if (failedTools.length > 0 && failedTools.length === input.toolResults.length) {
      return {
        shouldContinue: false,
        stopReason: 'critical_tool_failure',
        needsMoreContext: false,
        planStillValid: false,
      };
    }

    if (input.toolResults.length === 0) {
      return {
        shouldContinue: false,
        stopReason: 'no_tools_executed',
        needsMoreContext: false,
        planStillValid: true,
      };
    }

    const allSucceeded = input.toolResults.every((t) => t.success);
    if (allSucceeded && input.cycle >= 1) {
      return {
        shouldContinue: false,
        stopReason: 'objective_likely_met',
        needsMoreContext: false,
        planStillValid: true,
      };
    }

    return {
      shouldContinue: input.cycle < 2,
      needsMoreContext: failedTools.length > 0,
      planStillValid: true,
    };
  }

  summarizeCycle(results: ExecutionCycleResult): string {
    const tools = results.toolResults.map((t) => `${t.tool}: ${t.success ? 'ok' : 'falha'}`).join(', ');
    return `Ciclo ${results.cycle}: ${tools || 'sem tools'}`;
  }
}
