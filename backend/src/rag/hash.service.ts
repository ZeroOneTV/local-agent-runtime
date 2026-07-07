import { createHash } from 'crypto';

export function computeContentHash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function computeChunkConfigHash(
  chunkSize: number,
  chunkOverlap: number,
): string {
  return createHash('sha256')
    .update(`${chunkSize}:${chunkOverlap}`)
    .digest('hex')
    .slice(0, 16);
}
