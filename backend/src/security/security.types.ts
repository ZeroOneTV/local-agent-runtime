export type ExecutionMode = 'safe' | 'developer' | 'autonomous';

export type PermissionDecision =
  | { allowed: true; requiresApproval: boolean; auditLevel: 'basic' | 'full' }
  | { allowed: false; reason: string; code: string };

export interface PermissionContext {
  projectId: string;
  conversationId?: string;
  userId?: string;
  toolName: string;
  riskLevel: string;
  toolKind: string;
  executionMode: ExecutionMode;
  approved: boolean;
}

export interface PolicyContext {
  projectId: string;
  conversationId?: string;
  toolName: string;
  riskLevel: string;
  toolKind: string;
  executionMode: ExecutionMode;
  approved: boolean;
  args: Record<string, unknown>;
}

export interface AuditEntry {
  projectId: string;
  conversationId?: string;
  toolCallId?: string;
  userId?: string;
  toolName: string;
  parameters: Record<string, unknown>;
  result?: unknown;
  success?: boolean;
  executionTime?: number;
  approved: boolean;
  approvedBy?: string;
  errorCode?: string;
  policyBlocked?: boolean;
}
