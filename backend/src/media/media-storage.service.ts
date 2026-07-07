import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MediaConfigService } from './media.config';

@Injectable()
export class MediaStorageService {
  constructor(private readonly config: MediaConfigService) {}

  originalsDir(projectId: string): string {
    return path.join(this.config.storageRoot, 'images', 'originals', projectId);
  }

  thumbnailsDir(projectId: string): string {
    return path.join(this.config.storageRoot, 'images', 'thumbnails', projectId);
  }

  processedDir(projectId: string): string {
    return path.join(this.config.storageRoot, 'images', 'processed', projectId);
  }

  contextsDir(projectId: string): string {
    return path.join(this.config.storageRoot, 'images', 'contexts', projectId);
  }

  async saveOriginal(
    projectId: string,
    mediaId: string,
    buffer: Buffer,
    ext: string,
  ): Promise<string> {
    const dir = this.originalsDir(projectId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${mediaId}.${ext}`);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  async saveProcessedJson(
    projectId: string,
    mediaId: string,
    data: unknown,
  ): Promise<string> {
    const dir = this.processedDir(projectId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${mediaId}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return filePath;
  }

  async saveContextMarkdown(
    projectId: string,
    mediaId: string,
    content: string,
  ): Promise<string> {
    const dir = this.contextsDir(projectId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${mediaId}.md`);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }
}
