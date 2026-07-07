import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PathGuardService } from '../path-guard.service';
import { StructuredToolResult } from '../tools.types';
import { SecurityConfigService } from '../../security/security.config';

@Injectable()
export class FileSystemService {
  constructor(
    private readonly pathGuard: PathGuardService,
    private readonly securityConfig: SecurityConfigService,
  ) {}

  async readFile(
    rootPath: string,
    filePath: string,
  ): Promise<StructuredToolResult> {
    if (this.pathGuard.isPathEscapeAttempt(filePath)) {
      return this.error('PATH_FORBIDDEN', 'Caminho não permitido');
    }

    const safePath = this.pathGuard.resolveSafePath(rootPath, filePath);
    if (!safePath) return this.error('PATH_FORBIDDEN', 'Caminho fora do root_path');

    try {
      const content = await fs.readFile(safePath, 'utf-8');
      const stats = await fs.stat(safePath);
      return {
        success: true,
        data: { path: filePath, content },
        metadata: { bytes: stats.size },
      };
    } catch {
      return this.error('FILE_NOT_FOUND', 'Arquivo não encontrado');
    }
  }

  async listDirectory(
    rootPath: string,
    dirPath: string,
  ): Promise<StructuredToolResult> {
    const safePath = this.pathGuard.resolveSafePath(rootPath, dirPath || '.');
    if (!safePath) return this.error('PATH_FORBIDDEN', 'Caminho fora do root_path');

    try {
      const entries = await fs.readdir(safePath, { withFileTypes: true });
      const listing = entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
      }));
      return { success: true, data: { path: dirPath || '.', entries: listing } };
    } catch {
      return this.error('DIR_NOT_FOUND', 'Diretório não encontrado');
    }
  }

  async searchFiles(
    rootPath: string,
    query: string,
    searchPath = '.',
  ): Promise<StructuredToolResult> {
    const safePath = this.pathGuard.resolveSafePath(rootPath, searchPath);
    if (!safePath) return this.error('PATH_FORBIDDEN', 'Caminho fora do root_path');

    const results: string[] = [];
    const maxFiles = this.securityConfig.maxFilesPerSearch;
    const maxDepth = this.securityConfig.maxDirectoryDepth;
    await this.searchInDir(safePath, rootPath, query, results, 0, maxDepth, maxFiles);
    return {
      success: true,
      data: { query, matches: results },
      metadata: { count: results.length },
    };
  }

  async writeFile(
    rootPath: string,
    filePath: string,
    content: string,
  ): Promise<StructuredToolResult> {
    const safePath = this.pathGuard.resolveSafePath(rootPath, filePath);
    if (!safePath) return this.error('PATH_FORBIDDEN', 'Caminho fora do root_path');

    try {
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, content, 'utf-8');
      return {
        success: true,
        data: { path: filePath, written: true },
        metadata: { bytes: Buffer.byteLength(content, 'utf-8') },
      };
    } catch (e) {
      return this.error('WRITE_FAILED', `Erro ao escrever: ${e}`);
    }
  }

  async applyPatch(
    rootPath: string,
    filePath: string,
    content: string,
  ): Promise<StructuredToolResult> {
    return this.writeFile(rootPath, filePath, content);
  }

  async deleteFile(
    rootPath: string,
    filePath: string,
  ): Promise<StructuredToolResult> {
    const safePath = this.pathGuard.resolveSafePath(rootPath, filePath);
    if (!safePath) return this.error('PATH_FORBIDDEN', 'Caminho fora do root_path');

    try {
      await fs.unlink(safePath);
      return { success: true, data: { path: filePath, deleted: true } };
    } catch {
      return this.error('DELETE_FAILED', 'Arquivo não encontrado ou não pode ser removido');
    }
  }

  private async searchInDir(
    dir: string,
    rootPath: string,
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
          rootPath,
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
            results.push(path.relative(rootPath, fullPath));
          }
        } catch {
          // skip binary
        }
      }
    }
  }

  private error(code: string, message: string): StructuredToolResult {
    return { success: false, error: { code, message } };
  }
}
