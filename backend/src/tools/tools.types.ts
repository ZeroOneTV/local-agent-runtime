export type ToolCategory =
  | 'filesystem'
  | 'git'
  | 'terminal'
  | 'database'
  | 'browser'
  | 'memory'
  | 'rag'
  | 'project'
  | 'media'
  | 'jobs';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ToolKind = 'readonly' | 'write' | 'execution' | 'external';

export type ToolCallStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled';

export interface JsonSchemaProperty {
  type: string;
  description?: string;
  required?: boolean;
  enum?: string[];
}

/** Standard JSON Schema (OpenAI/Ollama function-calling compatible). */
export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, Omit<JsonSchemaProperty, 'required'>>;
  required: string[];
}

/** OpenAI/Ollama-compatible tool descriptor sent in the `tools` payload. */
export interface OllamaToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JsonSchemaObject;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  kind: ToolKind;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  async: boolean;
  inputSchema: Record<string, JsonSchemaProperty>;
  outputSchema: Record<string, JsonSchemaProperty>;
  /**
   * Whether a persistent "always allow" grant may be created for this tool.
   * Defaults to true; set false for destructive/high-blast-radius tools so
   * they can only be approved once at a time. Replaces the old hardcoded
   * NEVER_ALWAYS_ALLOW list (config-driven per the registry).
   */
  allowPersistentGrant?: boolean;
  /**
   * Optional runtime availability check. When it returns false, the tool is
   * hidden from the list exposed to the model (toOllamaTools) so it won't try
   * to call a capability that isn't configured. Absent → always available.
   */
  isAvailable?: () => boolean;
}

export interface StructuredToolResult {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  metadata?: Record<string, unknown>;
}

export interface ToolExecutionContext {
  projectId: string;
  conversationId?: string;
  userId?: string;
  rootPath: string;
  approved: boolean;
  approvedBy?: string;
  executionMode: string;
}

export interface ToolHandler {
  execute(
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<StructuredToolResult>;
}

export interface ExecuteToolRequest {
  tool: string;
  args: Record<string, unknown>;
  projectId: string;
  conversationId?: string;
  userId?: string;
  approved?: boolean;
  approvedBy?: string;
}

export interface ExecuteToolResponse {
  toolCallId?: string;
  status: ToolCallStatus;
  result?: StructuredToolResult;
  requiresApproval?: boolean;
  message?: string;
  jobId?: string;
}

export function truncateToolOutput(
  result: StructuredToolResult,
  maxChars: number,
): string {
  const json = JSON.stringify(result, null, 2);
  if (json.length <= maxChars) return json;
  return json.slice(0, maxChars) + '\n...[truncado]';
}
