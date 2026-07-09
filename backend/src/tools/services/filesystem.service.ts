import { Injectable } from '@nestjs/common';
import { LocalFilesystemAccessService } from '../../local-filesystem/local-filesystem-access.service';
import { FilesystemOperationContext } from '../../local-filesystem/local-filesystem.types';
import { StructuredToolResult } from '../tools.types';

type FsCtx = Partial<FilesystemOperationContext> & { projectRoot?: string };

@Injectable()
export class FileSystemService {
  constructor(private readonly localFs: LocalFilesystemAccessService) {}

  private ctx(rootPath: string, extra?: FsCtx): FilesystemOperationContext {
    return {
      projectRoot: rootPath,
      projectId: extra?.projectId,
      conversationId: extra?.conversationId,
      approved: extra?.approved ?? false,
    };
  }

  readFile(
    rootPath: string,
    filePath: string,
    extra?: FsCtx,
  ): Promise<StructuredToolResult> {
    return this.localFs.readFile(rootPath, filePath, this.ctx(rootPath, extra));
  }

  listDirectory(
    rootPath: string,
    dirPath: string,
    extra?: FsCtx,
  ): Promise<StructuredToolResult> {
    return this.localFs.listDirectory(
      rootPath,
      dirPath || '.',
      this.ctx(rootPath, extra),
    );
  }

  searchFiles(
    rootPath: string,
    query: string,
    searchPath = '.',
    extra?: FsCtx,
  ): Promise<StructuredToolResult> {
    return this.localFs.searchFiles(
      rootPath,
      query,
      searchPath,
      this.ctx(rootPath, extra),
    );
  }

  writeFile(
    rootPath: string,
    filePath: string,
    content: string,
    extra?: FsCtx,
  ): Promise<StructuredToolResult> {
    return this.localFs.writeFile(
      rootPath,
      filePath,
      content,
      this.ctx(rootPath, extra),
    );
  }

  applyPatch(
    rootPath: string,
    filePath: string,
    content: string,
    extra?: FsCtx,
  ): Promise<StructuredToolResult> {
    return this.writeFile(rootPath, filePath, content, extra);
  }

  deleteFile(
    rootPath: string,
    filePath: string,
    extra?: FsCtx,
  ): Promise<StructuredToolResult> {
    return this.localFs.deleteFile(rootPath, filePath, this.ctx(rootPath, extra));
  }

  stat(
    rootPath: string,
    filePath: string,
    extra?: FsCtx,
  ): Promise<StructuredToolResult> {
    return this.localFs.stat(rootPath, filePath, this.ctx(rootPath, extra));
  }
}
