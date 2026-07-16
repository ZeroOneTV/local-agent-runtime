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

export interface FsSizeEntry {
  name: string;
  path: string;
  sizeBytes: number;
  estimated?: boolean;
}

export interface FsSizeSummaryResult {
  path: string;
  directoryCount: number;
  fileCount: number;
  heaviestFile?: FsSizeEntry;
  heaviestDirectory?: FsSizeEntry;
  recursiveUsed: boolean;
  warnings: string[];
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

  /**
   * Superficial (default): top-level counts + heaviest file; directory sizes
   * estimated from immediate children only.
   * Recursive: limited walk with maxDepth/maxEntries.
   */
  async sizeSummary(
    resolvedPath: string,
    displayPath: string,
    options: {
      includeFiles?: boolean;
      includeDirectories?: boolean;
      recursive?: boolean;
      maxDepth?: number;
      maxEntries?: number;
    } = {},
  ): Promise<FsSizeSummaryResult> {
    const includeFiles = options.includeFiles !== false;
    const includeDirectories = options.includeDirectories !== false;
    const recursive = options.recursive === true;
    const maxDepth = options.maxDepth ?? (recursive ? 3 : 1);
    const maxEntries = options.maxEntries ?? 500;
    const warnings: string[] = [];

    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    let directoryCount = 0;
    let fileCount = 0;
    let heaviestFile: FsSizeEntry | undefined;
    let heaviestDirectory: FsSizeEntry | undefined;
    let scanned = 0;
    let truncated = false;

    for (const entry of entries) {
      if (scanned >= maxEntries) {
        truncated = true;
        break;
      }
      const full = path.join(resolvedPath, entry.name);
      const display = path.join(displayPath, entry.name);

      if (entry.isDirectory()) {
        directoryCount++;
        if (!includeDirectories) continue;
        scanned++;
        try {
          const size = recursive
            ? await this.dirSizeLimited(full, 0, maxDepth, maxEntries, { count: scanned })
            : await this.dirSizeImmediate(full);
          scanned = Math.max(scanned, size.scanned);
          if (size.truncated) truncated = true;
          const item: FsSizeEntry = {
            name: entry.name,
            path: display,
            sizeBytes: size.bytes,
            estimated: !recursive || size.truncated,
          };
          if (!heaviestDirectory || item.sizeBytes > heaviestDirectory.sizeBytes) {
            heaviestDirectory = item;
          }
        } catch {
          warnings.push(`Não foi possível medir pasta: ${entry.name}`);
        }
      } else if (entry.isFile()) {
        fileCount++;
        if (!includeFiles) continue;
        scanned++;
        try {
          const st = await fs.stat(full);
          const item: FsSizeEntry = {
            name: entry.name,
            path: display,
            sizeBytes: st.size,
            estimated: false,
          };
          if (!heaviestFile || item.sizeBytes > heaviestFile.sizeBytes) {
            heaviestFile = item;
          }
        } catch {
          warnings.push(`Não foi possível medir arquivo: ${entry.name}`);
        }
      }
    }

    if (!recursive) {
      warnings.push(
        'Resumo superficial (não-recursivo): tamanho de pastas estimado só com filhos imediatos. Peça "cálculo profundo" para recursivo.',
      );
    }
    if (truncated) {
      warnings.push(`Varredura limitada a ~${maxEntries} entradas / profundidade ${maxDepth}.`);
    }

    return {
      path: displayPath,
      directoryCount,
      fileCount,
      heaviestFile,
      heaviestDirectory,
      recursiveUsed: recursive,
      warnings,
    };
  }

  /** Sum file sizes one level inside a directory (no recursion into subdirs). */
  private async dirSizeImmediate(dir: string): Promise<{ bytes: number; scanned: number; truncated: boolean }> {
    let bytes = 0;
    let scanned = 0;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        scanned++;
        if (!e.isFile()) continue;
        try {
          const st = await fs.stat(path.join(dir, e.name));
          bytes += st.size;
        } catch {
          // skip
        }
      }
    } catch {
      // skip
    }
    return { bytes, scanned, truncated: false };
  }

  private async dirSizeLimited(
    dir: string,
    depth: number,
    maxDepth: number,
    maxEntries: number,
    counter: { count: number },
  ): Promise<{ bytes: number; scanned: number; truncated: boolean }> {
    if (depth > maxDepth || counter.count >= maxEntries) {
      return { bytes: 0, scanned: counter.count, truncated: true };
    }
    let bytes = 0;
    let truncated = false;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (counter.count >= maxEntries) {
          truncated = true;
          break;
        }
        counter.count++;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          const sub = await this.dirSizeLimited(full, depth + 1, maxDepth, maxEntries, counter);
          bytes += sub.bytes;
          if (sub.truncated) truncated = true;
        } else if (e.isFile()) {
          try {
            const st = await fs.stat(full);
            bytes += st.size;
          } catch {
            // skip
          }
        }
      }
    } catch {
      // skip
    }
    return { bytes, scanned: counter.count, truncated };
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
