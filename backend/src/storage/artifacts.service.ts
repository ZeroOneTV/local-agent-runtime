import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class ArtifactsService {
  constructor(private readonly config: ConfigService) {}

  get artifactsRoot(): string {
    return this.config.get<string>('storage.artifacts') || '/storage/artifacts';
  }

  async saveToolOutput(
    toolCallId: string,
    fullOutput: string,
  ): Promise<string> {
    const dir = path.join(this.artifactsRoot, 'tool-results');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${toolCallId}.json`);
    await fs.writeFile(filePath, fullOutput, 'utf-8');
    return filePath;
  }

  async readArtifact(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }
}
