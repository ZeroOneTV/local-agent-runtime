import type { ActiveTarget } from '../../memory-stratification/memory.types';

export type AgenticDecision =
  | 'auto_execute'
  | 'pending_approval'
  | 'deny'
  | 'skip';

export type GrantType = 'allow_once' | 'always_allow' | 'deny';

export type GrantScopeType =
  | 'single_call'
  | 'conversation'
  | 'project'
  | 'path'
  | 'command_pattern'
  | 'session';

export type ApprovalAction =
  | 'allow_once'
  | 'always_conversation'
  | 'always_path'
  | 'always_project'
  | 'deny';

export interface AgenticAction {
  type: 'tool_call';
  toolName: string;
  args: Record<string, unknown>;
  risk: 'low' | 'medium' | 'high' | 'critical';
  requiresApproval: boolean;
  reason?: string;
  path?: string;
  command?: string;
}

export interface AgenticPolicyDecision {
  decision: AgenticDecision;
  risk: string;
  reason: string;
  grantOptions?: ApprovalAction[];
  grantId?: string;
}

export interface AgenticPreActionResult {
  actionsDetected: number;
  autoExecuted: number;
  pendingApprovals: number;
  denied: number;
  toolContext: string;
  approvalMessages: string[];
  pending: Array<{
    tool: string;
    message: string;
    toolCallId?: string;
  }>;
  deniedMessages: string[];
  debugCalls: Array<{
    toolName: string;
    decision: AgenticDecision;
    risk: string;
    durationMs?: number;
    reason?: string;
  }>;
  /** When true, orchestrator should return approval/deny message without heavy LLM */
  shortCircuit?: boolean;
  shortCircuitContent?: string;
  activeTargetBefore?: ActiveTarget | null;
  activeTargetAfter?: ActiveTarget | null;
  followUpResolved?: boolean;
  selectedPath?: string;
  pathResolutionDebug?: Record<string, unknown>;
}

export interface AgenticResolveContext {
  projectId: string;
  conversationId: string;
  userId?: string;
  projectRoot: string;
  message: string;
}
