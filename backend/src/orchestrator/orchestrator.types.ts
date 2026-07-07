export type IntentType =
  | 'question_answer'
  | 'architecture_discussion'
  | 'code_analysis'
  | 'code_change'
  | 'debug'
  | 'planning'
  | 'research'
  | 'file_operation'
  | 'project_indexing'
  | 'memory_operation'
  | 'long_running_task';

export type FlowType = 'direct' | 'project' | 'complex' | 'long_job';

export type Complexity = 'low' | 'medium' | 'high';

export interface IntentAnalysis {
  intent: IntentType;
  complexity: Complexity;
  flow: FlowType;
  needsContext: boolean;
  needsRag: boolean;
  needsTools: boolean;
  needsPlan: boolean;
  canAnswerDirectly: boolean;
  likelyRisk: 'low' | 'medium' | 'high';
  suggestedReadonlyTools: string[];
}

export interface OrchestratorPlan {
  objective: string;
  steps: string[];
  requiresApproval: boolean;
  toolsPlanned: string[];
  risks: string[];
  completionCriteria: string;
}

export interface ExecutionCycleResult {
  cycle: number;
  toolResults: { tool: string; success: boolean; summary: string }[];
  shouldContinue: boolean;
  stopReason?: string;
  pendingApprovals: { tool: string; message: string; toolCallId?: string }[];
}

export interface MemorySuggestion {
  title: string;
  content: string;
  importance: number;
  reason: string;
}

export interface OrchestratorResult {
  content: string;
  model: string;
  intent: IntentAnalysis;
  plan?: OrchestratorPlan;
  cycles: ExecutionCycleResult[];
  events: string[];
  memorySuggestions: MemorySuggestion[];
  jobId?: string;
  debug?: Record<string, unknown>;
  contextMetadata?: Record<string, unknown>;
  pendingApprovals: { tool: string; message: string; toolCallId?: string }[];
}

export const READONLY_AUTO_TOOLS = [
  'read_file',
  'list_directory',
  'search_files',
  'git_status',
  'git_diff',
  'search_rag',
  'search_memories',
  'inspect_structure',
  'detect_stack',
  'list_dependencies',
];
