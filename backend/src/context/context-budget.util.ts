import { ChatMessage } from '../llm/llm.service';
import { estimateTokenCount } from '../common/constants';

export function trimMessagesToTokenBudget(
  messages: ChatMessage[],
  maxTokens: number,
): { messages: ChatMessage[]; truncated: boolean } {
  if (maxTokens <= 0 || messages.length <= 1) {
    return { messages, truncated: false };
  }

  let trimmed = [...messages];
  let truncated = false;

  while (
    trimmed.length > 1 &&
    estimateTokenCount(trimmed.map((m) => m.content).join('')) > maxTokens
  ) {
    trimmed = trimmed.slice(1);
    truncated = true;
  }

  return { messages: trimmed, truncated };
}

export function trimLayersToTokenBudget(
  layers: { name: string; content: string }[],
  maxTokens: number,
): { layers: { name: string; content: string }[]; truncated: boolean } {
  const removable = new Set(['rag', 'media', 'tool_results', 'memories', 'summary']);
  let trimmed = [...layers];
  let truncated = false;

  const totalTokens = () =>
    estimateTokenCount(trimmed.map((l) => l.content).join(''));

  while (totalTokens() > maxTokens) {
    const idx = trimmed.findIndex((l) => removable.has(l.name));
    if (idx < 0) break;
    trimmed.splice(idx, 1);
    truncated = true;
  }

  return { layers: trimmed, truncated };
}
