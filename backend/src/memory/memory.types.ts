export type MemoryOrigin =
  | 'user_confirmation'
  | 'architectural_decision'
  | 'project_rule'
  | 'backend_synthesis';

export const VALID_MEMORY_ORIGINS: MemoryOrigin[] = [
  'user_confirmation',
  'architectural_decision',
  'project_rule',
  'backend_synthesis',
];

const INVALID_MEMORY_PATTERNS = [
  /usu[aá]rio perguntou/i,
  /foi executada uma tool/i,
  /tool executada/i,
  /perguntou sobre/i,
];

export function isValidMemoryContent(content: string): boolean {
  return !INVALID_MEMORY_PATTERNS.some((p) => p.test(content));
}
