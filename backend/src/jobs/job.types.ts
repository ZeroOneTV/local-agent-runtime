export type JobType =
  | 'project_indexing'
  | 'project_analysis'
  | 'rag_reindex'
  | 'long_running_task'
  | 'index_project';

export type JobStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

export interface OrchestratorJobPayload {
  conversationId?: string;
  message?: string;
  stepsCompleted?: number;
  currentStep?: string;
  intent?: string;
}

export interface ProjectIndexingResult {
  filesScanned: number;
  filesIndexed: number;
  chunksCreated: number;
  skippedUnchanged: number;
}

export interface ProjectAnalysisResult {
  summary: string;
  strengths: string[];
  risks: string[];
  inconsistencies: string[];
  nextSteps: string[];
  partial: boolean;
}
