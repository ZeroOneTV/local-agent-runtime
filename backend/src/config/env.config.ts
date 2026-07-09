export const envConfig = () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  backendPort: parseInt(process.env.BACKEND_PORT || '3001', 10),
  llm: {
    provider: process.env.LLM_PROVIDER || 'ollama',
    baseUrl: process.env.LLM_BASE_URL || 'http://host.docker.internal:11434',
    model: process.env.LLM_MODEL || 'qwen3:14b',
    timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '120000', 10),
    streaming: process.env.LLM_STREAMING !== 'false',
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
    artifacts: process.env.ARTIFACTS_PATH || '/storage/artifacts',
    tempMaxAgeHours: parseInt(process.env.STORAGE_TEMP_MAX_AGE_HOURS || '24', 10),
    artifactMaxAgeDays: parseInt(process.env.STORAGE_ARTIFACT_MAX_AGE_DAYS || '30', 10),
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
    maxRecentTokens: parseInt(process.env.CONTEXT_MAX_RECENT_TOKENS || '3000', 10),
    summaryMessageThreshold: parseInt(process.env.CONTEXT_SUMMARY_MESSAGE_THRESHOLD || '20', 10),
    summaryTokenThreshold: parseInt(process.env.CONTEXT_SUMMARY_TOKEN_THRESHOLD || '4000', 10),
    memoryLimit: parseInt(process.env.CONTEXT_MEMORY_LIMIT || '5', 10),
    ragChunkLimit: parseInt(process.env.CONTEXT_RAG_CHUNK_LIMIT || '5', 10),
    recentToolResultsLimit: parseInt(process.env.CONTEXT_TOOL_RESULTS_LIMIT || '5', 10),
    highImportanceThreshold: parseInt(process.env.CONTEXT_HIGH_IMPORTANCE_THRESHOLD || '4', 10),
    skipRagForCasual: process.env.CONTEXT_SKIP_RAG_CASUAL !== 'false',
  },
  jobs: {
    orchestratorConcurrency: parseInt(process.env.JOBS_ORCHESTRATOR_CONCURRENCY || '1', 10),
    indexingConcurrency: parseInt(process.env.JOBS_INDEXING_CONCURRENCY || '1', 10),
    embeddingsConcurrency: parseInt(process.env.JOBS_EMBEDDINGS_CONCURRENCY || '1', 10),
    mediaConcurrency: parseInt(process.env.JOBS_MEDIA_CONCURRENCY || '1', 10),
    toolsConcurrency: parseInt(process.env.JOBS_TOOLS_CONCURRENCY || '2', 10),
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
  media: {
    storageRoot: process.env.MEDIA_STORAGE_ROOT || '/storage/media',
    workerUrl: process.env.MEDIA_WORKER_URL || 'http://media-worker:5000',
    workerTimeoutMs: parseInt(process.env.MEDIA_WORKER_TIMEOUT_MS || '120000', 10),
    processingTimeoutMs: parseInt(process.env.MEDIA_PROCESSING_TIMEOUT_MS || '180000', 10),
    maxFileBytes:
      parseInt(process.env.MEDIA_MAX_IMAGE_SIZE_MB || '25', 10) * 1024 * 1024,
    maxWidth: parseInt(process.env.MEDIA_MAX_IMAGE_WIDTH || '8000', 10),
    maxHeight: parseInt(process.env.MEDIA_MAX_IMAGE_HEIGHT || '8000', 10),
    enableVlm: process.env.MEDIA_ENABLE_VLM === 'true',
    defaultProcessingMode: process.env.MEDIA_DEFAULT_PROCESSING_MODE || 'balanced',
    waitForProcessingMs: parseInt(process.env.MEDIA_WAIT_FOR_PROCESSING_MS || '5000', 10),
    requireIndexConfirmation: process.env.MEDIA_REQUIRE_CONFIRMATION_TO_INDEX !== 'false',
    generateThumbnails: process.env.MEDIA_GENERATE_THUMBNAILS !== 'false',
    workerConcurrency: parseInt(process.env.MEDIA_WORKER_CONCURRENCY || '1', 10),
    ocrPrimary: process.env.MEDIA_OCR_PRIMARY || 'paddleocr',
    enablePaddleOcr: process.env.MEDIA_ENABLE_PADDLEOCR !== 'false',
    enableTesseractFallback: process.env.MEDIA_ENABLE_TESSERACT_FALLBACK !== 'false',
    ocrLanguages: process.env.MEDIA_OCR_LANGUAGES || 'pt,en',
    enablePpStructure: process.env.MEDIA_ENABLE_PP_STRUCTURE !== 'false',
    enableDocling: process.env.MEDIA_ENABLE_DOCLING !== 'false',
    doclingOnlyForDocuments: process.env.MEDIA_DOCLING_ONLY_FOR_DOCUMENTS !== 'false',
    vlmProvider: process.env.MEDIA_VLM_PROVIDER || 'ollama',
    vlmModel: process.env.MEDIA_VLM_MODEL || 'qwen2.5vl:7b',
    vlmBaseUrl: process.env.MEDIA_VLM_BASE_URL || 'http://host.docker.internal:11434',
    vlmMaxImageSize: parseInt(process.env.MEDIA_VLM_MAX_IMAGE_SIZE || '1280', 10),
  },
  memoryStratification: {
    workingTtlHours: parseInt(process.env.MEMORY_WORKING_TTL_HOURS || '72', 10),
    workingProjectTtlDays: parseInt(process.env.MEMORY_WORKING_PROJECT_TTL_DAYS || '7', 10),
    recentTtlDays: parseInt(process.env.MEMORY_RECENT_TTL_DAYS || '30', 10),
    deepArchiveAfterDays: parseInt(process.env.MEMORY_DEEP_ARCHIVE_AFTER_DAYS || '180', 10),
    accessRefresh: process.env.MEMORY_ACCESS_REFRESH !== 'false',
    retrievalEnableDeep: process.env.MEMORY_RETRIEVAL_ENABLE_DEEP !== 'false',
    retrievalEnableArchive: process.env.MEMORY_RETRIEVAL_ENABLE_ARCHIVE === 'true',
    retrievalMaxRecent: parseInt(process.env.MEMORY_RETRIEVAL_MAX_RECENT || '5', 10),
    retrievalMaxConsolidated: parseInt(process.env.MEMORY_RETRIEVAL_MAX_CONSOLIDATED || '5', 10),
    retrievalMaxDeep: parseInt(process.env.MEMORY_RETRIEVAL_MAX_DEEP || '3', 10),
    exportDefaultProfile: process.env.MEMORY_EXPORT_DEFAULT_PROFILE || 'portable',
    exportIncludeWorking: process.env.MEMORY_EXPORT_INCLUDE_WORKING === 'true',
    exportIncludeAudit: process.env.MEMORY_EXPORT_INCLUDE_AUDIT === 'true',
    exportMaxSizeMb: parseInt(process.env.MEMORY_EXPORT_MAX_SIZE_MB || '2048', 10),
    importDefaultMode: process.env.MEMORY_IMPORT_DEFAULT_MODE || 'new_project',
    importAutoReembed: process.env.MEMORY_IMPORT_AUTO_REEMBED !== 'false',
    storageRoot: process.env.MEMORY_STORAGE_ROOT || '/storage/memory',
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
  performance: {
    profile: process.env.APP_PERFORMANCE_PROFILE || 'balanced',
    resourceGuardEnabled: process.env.RESOURCE_GUARD_ENABLED !== 'false',
    resourceGuardMaxRamPercent: parseInt(process.env.RESOURCE_GUARD_MAX_RAM_PERCENT || '80', 10),
    resourceGuardMaxCpuPercent: parseInt(process.env.RESOURCE_GUARD_MAX_CPU_PERCENT || '85', 10),
    resourceGuardPauseLowPriority: process.env.RESOURCE_GUARD_PAUSE_LOW_PRIORITY !== 'false',
    resourceGuardCheckIntervalMs: parseInt(
      process.env.RESOURCE_GUARD_CHECK_INTERVAL_MS || '5000',
      10,
    ),
    toolResultInlineMaxKb: parseInt(process.env.TOOL_RESULT_INLINE_MAX_KB || '32', 10),
    contextArtifactPreviewMaxKb: parseInt(
      process.env.CONTEXT_ARTIFACT_PREVIEW_MAX_KB || '16',
      10,
    ),
    ragTopK: parseInt(process.env.RAG_TOP_K || process.env.CONTEXT_RAG_CHUNK_LIMIT || '5', 10),
  },
  hostFilesystem: {
    enabled: process.env.HOST_FILESYSTEM_ENABLED === 'true',
    mode: process.env.HOST_FILESYSTEM_MODE || 'disabled',
    allowBrowse: process.env.HOST_FILESYSTEM_ALLOW_BROWSE !== 'false',
    allowRead: process.env.HOST_FILESYSTEM_ALLOW_READ !== 'false',
    allowWrite: process.env.HOST_FILESYSTEM_ALLOW_WRITE === 'true',
    requireApprovalForWrite:
      process.env.HOST_FILESYSTEM_REQUIRE_APPROVAL_FOR_WRITE !== 'false',
    requireApprovalForDelete:
      process.env.HOST_FILESYSTEM_REQUIRE_APPROVAL_FOR_DELETE !== 'false',
    blockSensitivePaths: process.env.HOST_FILESYSTEM_BLOCK_SENSITIVE_PATHS !== 'false',
    auditEnabled: process.env.HOST_FILESYSTEM_AUDIT_ENABLED !== 'false',
    allowedDrives: process.env.HOST_FILESYSTEM_ALLOWED_DRIVES || '',
    defaultAccess: process.env.HOST_FILESYSTEM_DEFAULT_ACCESS || 'read',
    mounts: parseFilesystemMounts(process.env.HOST_FILESYSTEM_MOUNTS_JSON),
    hostAgentBaseUrl:
      process.env.HOST_AGENT_BASE_URL || 'http://host.docker.internal:3847',
    hostAgentTimeoutMs: parseInt(process.env.HOST_AGENT_TIMEOUT_MS || '30000', 10),
  },
});

function parseFilesystemMounts(raw?: string) {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{
      hostPrefix: string;
      containerPrefix: string;
      access: string;
    }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
