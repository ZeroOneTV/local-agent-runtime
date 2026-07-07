import { ChatMessage } from '../llm/llm.service';

export interface BuildContextInput {
  conversationId: string;
  projectId: string;
  currentMessage: string;
}

export interface ContextMetadata {
  layersIncluded: string[];
  estimatedTokens: number;
  summaryUsed: boolean;
  memoriesCount: number;
  ragChunksCount: number;
  toolResultsCount: number;
  recentMessagesCount: number;
  truncatedForBudget?: boolean;
  ragSkipped?: boolean;
  deduplicated?: boolean;
}

export interface BuiltContext {
  systemContent: string;
  messages: ChatMessage[];
  metadata: ContextMetadata;
}

export interface ContextLayer {
  name: string;
  content: string;
}
