export type MemoryLayer =
  | 'working'
  | 'recent'
  | 'consolidated'
  | 'deep'
  | 'archive'
  | 'rag'
  | 'media';

export type RecentMemorySourceType =
  | 'message'
  | 'tool_result'
  | 'job_result'
  | 'media_result'
  | 'summary'
  | 'user_note'
  | 'backend_synthesis';

export type RecentMemoryStatus = 'active' | 'expired' | 'promoted' | 'archived';

export type DeepMemorySourceType =
  | 'conversation'
  | 'tool_result'
  | 'job_result'
  | 'media_image'
  | 'media_audio'
  | 'document'
  | 'rag_context'
  | 'manual_import'
  | 'export_import';

export type EmbeddingStatus =
  | 'not_indexed'
  | 'indexed'
  | 'requires_reembedding'
  | 'failed';

export type ArchiveType =
  | 'conversation_archive'
  | 'tool_archive'
  | 'media_archive'
  | 'memory_export'
  | 'full_backup'
  | 'cold_snapshot';

export type ExportProfile = 'minimal' | 'portable' | 'full' | 'archive';

export type ImportMode = 'new_project' | 'merge' | 'replace';

export interface WorkingMemoryState {
  currentGoal?: string;
  activePlan?: { objective: string; steps: string[] };
  activeFiles?: string[];
  activeJobId?: string | null;
  pendingApprovals?: string[];
  temporaryFindings?: string[];
  lastError?: string | null;
  activeMediaIds?: string[];
  /** Pasta/arquivo em foco para follow-ups ("nessa pasta", "downloads", etc.). */
  activeTarget?: ActiveTarget | null;
  /** Operação pendente aguardando o usuário informar a pasta. */
  pendingFsIntent?: PendingFsIntent | null;
  updatedAt: string;
}

export interface PendingFsIntent {
  tool: string;
  recursive?: boolean;
  query?: string;
  createdAt: string;
}

export type ActiveTargetType =
  | 'filesystem_directory'
  | 'filesystem_file'
  | 'project_root';

export type ActiveTargetSource =
  | 'host_personal'
  | 'project'
  | 'absolute'
  | 'follow_up';

export interface ActiveTarget {
  type: ActiveTargetType;
  path: string;
  label?: string;
  source: ActiveTargetSource;
  lastOperation?: string;
  knownFolder?: string;
  updatedAt: string;
}

export interface MemoryRetrievalInput {
  projectId: string;
  conversationId?: string;
  query: string;
  intent?: string;
  maxTokens?: number;
}

export interface RetrievedMemoryItem {
  id: string;
  layer: MemoryLayer;
  title: string;
  content: string;
  score: number;
  importance?: number;
}

export interface MemoryRetrievalResult {
  working: RetrievedMemoryItem[];
  recent: RetrievedMemoryItem[];
  consolidated: RetrievedMemoryItem[];
  deep: RetrievedMemoryItem[];
  archive: RetrievedMemoryItem[];
  metadata: {
    searchedLayers: MemoryLayer[];
    skippedLayers: MemoryLayer[];
    reason: string;
  };
}

export interface ExportManifest {
  exportFormatVersion: string;
  project: { id: string; name: string; slug: string };
  createdAt: string;
  source: {
    appVersion: string;
    schemaVersion: string;
    machine: string;
  };
  models: {
    llm: { provider: string; model: string };
    embedding: { provider: string; model: string };
  };
  chunking: {
    chunkSize: number;
    chunkOverlap: number;
    chunkConfigHash: string;
  };
  included: Record<string, boolean>;
  compatibility: {
    requiresReembedding: boolean;
    portableAcrossModels: boolean;
  };
  encryption?: { enabled: boolean; algorithm: string | null };
}

export interface ImportValidationResult {
  valid: boolean;
  formatVersion?: string;
  requiresReembedding: boolean;
  warnings: string[];
  conflicts: string[];
}

export interface ImportReport {
  importId: string;
  status: string;
  projectId?: string;
  requiresReembedding: boolean;
  createdJobs: string[];
  idMapping?: Record<string, Record<string, string>>;
  warnings: string[];
  conflicts: string[];
}

export const HISTORICAL_LOOKUP_PATTERNS = [
  /\bantig[oa]s?\b/i,
  /\bantes\b/i,
  /\bnaquela vez\b/i,
  /\blembra\b/i,
  /\bcomo foi\b/i,
  /\bhistórico\b/i,
  /\baquele erro\b/i,
  /\baquele print\b/i,
  /\bdecisão anterior\b/i,
  /\bvoltar ao que fizemos\b/i,
];

export function shouldSearchDeepMemory(query: string, intent?: string): boolean {
  if (intent === 'historical_lookup') return true;
  return HISTORICAL_LOOKUP_PATTERNS.some((p) => p.test(query));
}

export function slugifyProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'project';
}

export function computeCompositeScore(params: {
  similarity: number;
  importance: number;
  recencyDays: number;
  accessCount: number;
  sourceReliability: number;
}): number {
  const recencyBonus = Math.max(0, 1 - params.recencyDays / 90) * 0.2;
  const importanceBonus = (params.importance / 5) * 0.3;
  const accessBonus = Math.min(params.accessCount, 10) * 0.02;
  const ageDecay = Math.min(params.recencyDays / 365, 1) * 0.15;
  return (
    params.similarity +
    recencyBonus +
    importanceBonus +
    accessBonus +
    params.sourceReliability * 0.1 -
    ageDecay
  );
}

export function textSimilarity(query: string, text: string): number {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  const t = text.toLowerCase();
  if (!q.length) return 0;
  const hits = q.filter((w) => w.length > 2 && t.includes(w)).length;
  return hits / q.length;
}
