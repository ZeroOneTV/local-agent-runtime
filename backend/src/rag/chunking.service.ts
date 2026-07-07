import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { computeChunkConfigHash } from './hash.service';

@Injectable()
export class ChunkingService {
  constructor(private readonly config: ConfigService) {}

  get chunkSize(): number {
    return this.config.get<number>('rag.chunkSize') ?? 1000;
  }

  get chunkOverlap(): number {
    return this.config.get<number>('rag.chunkOverlap') ?? 200;
  }

  getConfigHash(): string {
    return computeChunkConfigHash(this.chunkSize, this.chunkOverlap);
  }

  split(content: string): string[] {
    if (!content.trim()) return [''];

    const paragraphs = content.split(/\n{2,}/);
    const chunks: string[] = [];
    let current = '';

    for (const paragraph of paragraphs) {
      const block = paragraph.trim();
      if (!block) continue;

      if (block.length > this.chunkSize) {
        if (current) {
          chunks.push(current.trim());
          current = '';
        }
        chunks.push(...this.splitWithOverlap(block));
        continue;
      }

      const candidate = current ? `${current}\n\n${block}` : block;
      if (candidate.length <= this.chunkSize) {
        current = candidate;
      } else {
        if (current) chunks.push(current.trim());
        current = block;
      }
    }

    if (current) chunks.push(current.trim());
    return chunks.length ? chunks : [''];
  }

  private splitWithOverlap(text: string): string[] {
    const chunks: string[] = [];
    const step = Math.max(1, this.chunkSize - this.chunkOverlap);
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + this.chunkSize, text.length);
      chunks.push(text.slice(start, end));
      if (end >= text.length) break;
      start += step;
    }

    return chunks;
  }
}
