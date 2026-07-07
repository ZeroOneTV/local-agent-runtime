export const DEFAULT_PROJECT_ID = '00000000-0000-4000-8000-000000000001';
export const DEFAULT_LOCAL_USER_ID = '00000000-0000-4000-8000-000000000002';

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
