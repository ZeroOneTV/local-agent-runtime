export const envConfig = () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  backendPort: parseInt(process.env.BACKEND_PORT || '3001', 10),
  llm: {
    provider: process.env.LLM_PROVIDER || 'ollama',
    baseUrl: process.env.LLM_BASE_URL || 'http://host.docker.internal:11434',
    model: process.env.LLM_MODEL || 'qwen3:14b',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    url: process.env.REDIS_URL || 'redis://redis:6379',
  },
  vectorStore: process.env.VECTOR_STORE || 'pgvector',
  qdrantUrl: process.env.QDRANT_URL || 'http://qdrant:6333',
  storage: {
    path: process.env.STORAGE_PATH || '/storage',
    uploads: process.env.UPLOADS_PATH || '/storage/uploads',
    projects: process.env.PROJECTS_PATH || '/storage/projects',
    temp: process.env.TEMP_PATH || '/storage/temp',
  },
  security: {
    toolExecutionMode: process.env.TOOL_EXECUTION_MODE || 'approval_required',
    allowShellCommands: process.env.ALLOW_SHELL_COMMANDS === 'true',
    maxContextTokens: parseInt(process.env.MAX_CONTEXT_TOKENS || '24000', 10),
    maxConsecutiveCalls: parseInt(process.env.SECURITY_MAX_CONSECUTIVE_CALLS || '20', 10),
    maxDirectoryDepth: parseInt(process.env.SECURITY_MAX_DIRECTORY_DEPTH || '8', 10),
    maxFilesPerSearch: parseInt(process.env.SECURITY_MAX_FILES_PER_SEARCH || '100', 10),
    shellAllowlist: process.env.SECURITY_SHELL_ALLOWLIST || 'npm,git,node,ls,cat,pwd,echo,npx',
    disabledTools: process.env.SECURITY_DISABLED_TOOLS || '',
    autonomousTools:
      process.env.SECURITY_AUTONOMOUS_TOOLS ||
      'read_file,list_directory,search_files,git_status,search_rag',
    blockDeleteInProduction: process.env.SECURITY_BLOCK_DELETE_PRODUCTION !== 'false',
    blockBrowserOffline: process.env.SECURITY_BLOCK_BROWSER_OFFLINE !== 'false',
  },
  context: {
    recentMessagesWindow: parseInt(process.env.CONTEXT_RECENT_MESSAGES || '15', 10),
    summaryMessageThreshold: parseInt(process.env.CONTEXT_SUMMARY_MESSAGE_THRESHOLD || '20', 10),
    summaryTokenThreshold: parseInt(process.env.CONTEXT_SUMMARY_TOKEN_THRESHOLD || '4000', 10),
    memoryLimit: parseInt(process.env.CONTEXT_MEMORY_LIMIT || '5', 10),
    ragChunkLimit: parseInt(process.env.CONTEXT_RAG_CHUNK_LIMIT || '5', 10),
    recentToolResultsLimit: parseInt(process.env.CONTEXT_TOOL_RESULTS_LIMIT || '5', 10),
    highImportanceThreshold: parseInt(process.env.CONTEXT_HIGH_IMPORTANCE_THRESHOLD || '4', 10),
  },
  rag: {
    embeddingModel: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
    chunkSize: parseInt(process.env.RAG_CHUNK_SIZE || '1000', 10),
    chunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP || '200', 10),
  },
  tools: {
    maxOutputChars: parseInt(process.env.TOOL_MAX_OUTPUT_CHARS || '4000', 10),
    commandTimeoutMs: parseInt(process.env.TOOL_COMMAND_TIMEOUT_MS || '30000', 10),
    fetchTimeoutMs: parseInt(process.env.TOOL_FETCH_TIMEOUT_MS || '10000', 10),
  },
  cognitive: {
    maxCycles: parseInt(process.env.COGNITIVE_MAX_CYCLES || '8', 10),
    maxConsecutiveTools: parseInt(process.env.COGNITIVE_MAX_CONSECUTIVE_TOOLS || '3', 10),
    requireMemoryConfirmation: process.env.COGNITIVE_REQUIRE_MEMORY_CONFIRMATION !== 'false',
    defaultMode: process.env.COGNITIVE_DEFAULT_MODE || 'assisted_executor',
    enableReflection: process.env.COGNITIVE_ENABLE_REFLECTION !== 'false',
    enableLongJobs: process.env.COGNITIVE_ENABLE_LONG_JOBS !== 'false',
    eventSystem: process.env.COGNITIVE_EVENT_SYSTEM !== 'false',
    debug: process.env.COGNITIVE_DEBUG === 'true',
  },
  openwebui: {
    port: parseInt(process.env.OPENWEBUI_PORT || '3080', 10),
    apiKey: process.env.OPENWEBUI_API_KEY || 'local-dev-key',
    requireApiKey: process.env.OPENWEBUI_REQUIRE_API_KEY === 'true',
    logicalModels:
      process.env.OPENWEBUI_LOGICAL_MODELS ||
      'local-assistant|Local Assistant|00000000-0000-4000-8000-000000000001',
    apiKeyProjectMap: process.env.OPENWEBUI_API_KEY_PROJECT_MAP || '',
    webhookUrls: process.env.OPENWEBUI_WEBHOOK_URLS || '',
    approvalsBaseUrl: process.env.OPENWEBUI_APPROVALS_BASE_URL || 'http://localhost:3001',
  },
});
