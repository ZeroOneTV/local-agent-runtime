import { Injectable } from '@nestjs/common';
import { LocalFilesystemConfigService } from './local-filesystem.config';
import { PathResolverService } from './path-resolver.service';
import { FilesystemPermissionService } from './filesystem-permission.service';
import { FilesystemAuditService } from './filesystem-audit.service';
import { NativeFilesystemProvider } from './providers/native-filesystem.provider';
import { DockerMountedFilesystemProvider } from './providers/docker-mounted-filesystem.provider';
import { HostAgentFilesystemProvider } from './providers/host-agent-filesystem.provider';
import {
  FilesystemAccessCheck,
  FilesystemOperation,
  FilesystemOperationContext,
  HostFilesystemMode,
} from './local-filesystem.types';
import { StructuredToolResult } from '../tools/tools.types';

@Injectable()
export class LocalFilesystemAccessService {
  constructor(
    private readonly fsConfig: LocalFilesystemConfigService,
    private readonly resolver: PathResolverService,
    private readonly permissions: FilesystemPermissionService,
    private readonly audit: FilesystemAuditService,
    private readonly native: NativeFilesystemProvider,
    private readonly dockerMounted: DockerMountedFilesystemProvider,
    private readonly hostAgent: HostAgentFilesystemProvider,
  ) {}

  getMode(): HostFilesystemMode {
    if (!this.fsConfig.enabled) return 'disabled';
    return this.fsConfig.mode;
  }

  testAccess(
    inputPath: string,
    operation: FilesystemOperation,
    projectRoot: string,
    ctx: Partial<FilesystemOperationContext> = {},
  ): FilesystemAccessCheck {
    const mode = this.getMode();
    const resolved = this.resolver.resolve(inputPath, projectRoot, mode);
    return this.permissions.checkAccess(operation, resolved, {
      projectRoot,
      approved: ctx.approved ?? false,
      projectId: ctx.projectId,
      conversationId: ctx.conversationId,
    });
  }

  async listDirectory(
    projectRoot: string,
    dirPath: string,
    ctx: FilesystemOperationContext,
  ): Promise<StructuredToolResult> {
    return this.execute('list', dirPath || '.', projectRoot, ctx, async (resolved, check) => {
      const provider = this.getProvider(resolved.mode);
      const data = await provider.listDirectory(
        resolved.resolvedPath,
        resolved.originalPath || dirPath || '.',
      );
      return { success: true, data, metadata: { access: check.accessLevel } };
    });
  }

  async readFile(
    projectRoot: string,
    filePath: string,
    ctx: FilesystemOperationContext,
  ): Promise<StructuredToolResult> {
    return this.execute('read', filePath, projectRoot, ctx, async (resolved) => {
      const provider = this.getProvider(resolved.mode);
      const data = await provider.readFile(resolved.resolvedPath, resolved.originalPath);
      return { success: true, data, metadata: { bytes: data.bytes } };
    });
  }

  async stat(
    projectRoot: string,
    filePath: string,
    ctx: FilesystemOperationContext,
  ): Promise<StructuredToolResult> {
    return this.execute('stat', filePath, projectRoot, ctx, async (resolved) => {
      const provider = this.getProvider(resolved.mode);
      const data = await provider.stat(resolved.resolvedPath, resolved.originalPath);
      return { success: true, data };
    });
  }

  async searchFiles(
    projectRoot: string,
    query: string,
    searchPath: string,
    ctx: FilesystemOperationContext,
  ): Promise<StructuredToolResult> {
    return this.execute('search', searchPath || '.', projectRoot, ctx, async (resolved) => {
      const provider = this.getProvider(resolved.mode);
      const data = await provider.searchFiles(
        resolved.resolvedPath,
        resolved.originalPath || searchPath || '.',
        query,
      );
      return { success: true, data, metadata: { count: data.count } };
    });
  }

  async writeFile(
    projectRoot: string,
    filePath: string,
    content: string,
    ctx: FilesystemOperationContext,
  ): Promise<StructuredToolResult> {
    return this.execute('write', filePath, projectRoot, ctx, async (resolved) => {
      const provider = this.getProvider(resolved.mode);
      const data = await provider.writeFile(
        resolved.resolvedPath,
        resolved.originalPath,
        content,
      );
      return { success: true, data, metadata: { bytes: data.bytes } };
    });
  }

  async deleteFile(
    projectRoot: string,
    filePath: string,
    ctx: FilesystemOperationContext,
  ): Promise<StructuredToolResult> {
    return this.execute('delete', filePath, projectRoot, ctx, async (resolved) => {
      const provider = this.getProvider(resolved.mode);
      const data = await provider.deleteFile(resolved.resolvedPath, resolved.originalPath);
      return { success: true, data };
    });
  }

  async sizeSummary(
    projectRoot: string,
    dirPath: string,
    options: {
      includeFiles?: boolean;
      includeDirectories?: boolean;
      recursive?: boolean;
      maxDepth?: number;
      maxEntries?: number;
    },
    ctx: FilesystemOperationContext,
  ): Promise<StructuredToolResult> {
    return this.execute('size_summary', dirPath || '.', projectRoot, ctx, async (resolved) => {
      const provider = this.getProvider(resolved.mode);
      const data = await provider.sizeSummary(
        resolved.resolvedPath,
        resolved.originalPath || dirPath || '.',
        options,
      );
      return { success: true, data, metadata: { recursive: !!options.recursive } };
    });
  }

  private async execute(
    operation: FilesystemOperation,
    inputPath: string,
    projectRoot: string,
    ctx: FilesystemOperationContext,
    fn: (
      resolved: ReturnType<PathResolverService['resolve']>,
      check: FilesystemAccessCheck,
    ) => Promise<StructuredToolResult>,
  ): Promise<StructuredToolResult> {
    const mode = this.getMode();
    const resolved = this.resolver.resolve(inputPath, projectRoot, mode);
    const check = this.permissions.checkAccess(operation, resolved, ctx);

    if (!check.allowed) {
      this.audit.log({
        operation,
        originalPath: resolved.originalPath,
        resolvedPath: resolved.resolvedPath,
        mode,
        projectId: ctx.projectId,
        conversationId: ctx.conversationId,
        risk: check.risk || 'low',
        approved: ctx.approved ?? false,
        status: 'blocked',
        errorCode: 'PATH_FORBIDDEN',
      });
      return {
        success: false,
        error: { code: 'PATH_FORBIDDEN', message: check.reason || 'Acesso negado' },
      };
    }

    if (check.requiresApproval && !ctx.approved) {
      this.audit.log({
        operation,
        originalPath: resolved.originalPath,
        resolvedPath: resolved.resolvedPath,
        mode,
        projectId: ctx.projectId,
        conversationId: ctx.conversationId,
        risk: check.risk || 'high',
        approved: false,
        status: 'blocked',
        errorCode: 'APPROVAL_REQUIRED',
      });
      return {
        success: false,
        error: {
          code: 'APPROVAL_REQUIRED',
          message: 'Operação requer aprovação do usuário',
        },
      };
    }

    if (resolved.mode === 'host-agent') {
      await this.hostAgent.notImplemented();
    }

    try {
      const result = await fn(resolved, check);
      this.audit.log({
        operation,
        originalPath: resolved.originalPath,
        resolvedPath: resolved.resolvedPath,
        mode,
        projectId: ctx.projectId,
        conversationId: ctx.conversationId,
        risk: check.risk || 'low',
        approved: ctx.approved ?? false,
        status: 'success',
      });
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.audit.log({
        operation,
        originalPath: resolved.originalPath,
        resolvedPath: resolved.resolvedPath,
        mode,
        projectId: ctx.projectId,
        conversationId: ctx.conversationId,
        risk: check.risk || 'low',
        approved: ctx.approved ?? false,
        status: 'error',
        errorCode: 'FS_ERROR',
      });
      return {
        success: false,
        error: { code: 'FS_ERROR', message },
      };
    }
  }

  private getProvider(mode: HostFilesystemMode) {
    if (mode === 'docker-mounted') return this.dockerMounted;
    return this.native;
  }
}
