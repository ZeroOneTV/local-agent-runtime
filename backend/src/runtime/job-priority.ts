/** BullMQ: lower number = higher priority */
export const JobPriority = {
  HIGH: 1,
  MEDIUM: 5,
  LOW: 10,
} as const;

export type JobPriorityLevel = keyof typeof JobPriority;

export function priorityForJobType(type: string): number {
  const low = [
    'memory_decay',
    'memory_export',
    'memory_import',
    'memory_backup',
    'deep_memory_archive',
    'memory_reembedding',
    'storage_cleanup',
  ];
  const high = ['chat_context', 'process_image'];

  if (low.includes(type)) return JobPriority.LOW;
  if (high.includes(type)) return JobPriority.HIGH;
  return JobPriority.MEDIUM;
}

export const defaultJobOptions = {
  attempts: 2,
  removeOnComplete: 100,
  removeOnFail: 50,
};
