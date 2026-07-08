export type AppRole =
  | 'api'
  | 'all-in-one'
  | 'worker-orchestrator'
  | 'worker-indexing'
  | 'worker-embeddings'
  | 'worker-memory'
  | 'worker-media'
  | 'worker-all';

export type ProcessorKind =
  | 'orchestrator'
  | 'indexing'
  | 'embeddings'
  | 'memory'
  | 'media';

export function getAppRole(): AppRole {
  return (process.env.APP_ROLE || 'all-in-one') as AppRole;
}

export function isApiOnly(): boolean {
  return getAppRole() === 'api';
}

export function shouldRunProcessor(kind: ProcessorKind): boolean {
  const role = getAppRole();
  if (role === 'api') return false;
  if (role === 'all-in-one' || role === 'worker-all') return true;
  return role === `worker-${kind}`;
}

export function shouldRunAnyProcessor(): boolean {
  const kinds: ProcessorKind[] = [
    'orchestrator',
    'indexing',
    'embeddings',
    'memory',
    'media',
  ];
  return kinds.some((k) => shouldRunProcessor(k));
}
