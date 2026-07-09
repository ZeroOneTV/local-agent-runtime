import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LocalFilesystemConfigService } from '../local-filesystem.config';

export interface FsListResult {
  path: string;
  entries: Array<{ name: string; type: 'file' | 'directory' }>;
}

export interface FsReadResult {
  path: string;
  content: string;
  bytes: number;
}

export interface FsSearchResult {
  query: string;
  matches: string[];
  count: number;
}

@Injectable()
export class NativeFilesystemProvider {
  constructor(private readonly fsConfig: LocalFilesystemConfigService) {}

  async listDirectory(resolvedPath: string, displayPath: string): Promise<FsListResult> {
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    return {
      path: displayPath,
      entries: entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
      })),
    };
  }

  async readFile(resolvedPath: string, displayPath: string): Promise<FsReadResult> {
    const content = await fs.readFile(resolvedPath, 'utf-8');
    const stats = await fs.stat(resolvedPath);
    return { path: displayPath, content, bytes: stats.size };
  }

  async stat(resolvedPath: string, displayPath: string) {
    const stats = await fs.stat(resolvedPath);
    return {
      path: displayPath,
      type: stats.isDirectory() ? 'directory' : 'file',
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    };
  }

  async searchFiles(
    resolvedPath: string,
    displayRoot: string,
    query: string,
  ): Promise<FsSearchResult> {
    const results: string[] = [];
    const maxFiles = this.fsConfig.maxFilesPerSearch;
    const maxDepth = this.fsConfig.maxDirectoryDepth;
    await this.searchInDir(resolvedPath, displayRoot, query, results, 0, maxDepth, maxFiles);
    return { query, matches: results, count: results.length };
  }

  async writeFile(
    resolvedPath: string,
    displayPath: string,
    content: string,
  ): Promise<{ path: string; written: boolean; bytes: number }> {
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, content, 'utf-8');
    return {
      path: displayPath,
      written: true,
      bytes: Buffer.byteLength(content, 'utf-8'),
    };
  }

  async deleteFile(
    resolvedPath: string,
    displayPath: string,
  ): Promise<{ path: string; deleted: boolean }> {
    await fs.unlink(resolvedPath);
    return { path: displayPath, deleted: true };
  }

  private async searchInDir(
    dir: string,
    displayRoot: string,
    query: string,
    results: string[],
    depth: number,
    maxDepth: number,
    maxFiles: number,
  ): Promise<void> {
    if (results.length >= maxFiles || depth > maxDepth) return;

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.searchInDir(
          fullPath,
          displayRoot,
          query,
          results,
          depth + 1,
          maxDepth,
          maxFiles,
        );
      } else {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          if (content.toLowerCase().includes(query.toLowerCase())) {
            results.push(path.relative(displayRoot, fullPath) || entry.name);
          }
        } catch {
          // skip binary/unreadable
        }
      }
    }
  }
}
