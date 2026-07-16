import { Injectable } from '@nestjs/common';
import { LocalFilesystemConfigService } from './local-filesystem.config';
import { HostPathGuardService } from './path-guard.service';
import {
  FilesystemAccessCheck,
  FilesystemOperation,
  FilesystemOperationContext,
  ResolvedPathInfo,
} from './local-filesystem.types';

@Injectable()
export class FilesystemPermissionService {
  constructor(
    private readonly fsConfig: LocalFilesystemConfigService,
    private readonly pathGuard: HostPathGuardService,
  ) {}

  checkAccess(
    operation: FilesystemOperation,
    resolved: ResolvedPathInfo,
    ctx: FilesystemOperationContext,
  ): FilesystemAccessCheck {
    const base = {
      mode: resolved.mode,
      originalPath: resolved.originalPath,
      resolvedPath: resolved.resolvedPath,
      accessLevel: resolved.accessLevel,
    };

    if (resolved.mode === 'disabled' && !resolved.isProjectScoped) {
      return {
        ...base,
        allowed: false,
        reason: 'Filesystem externo desabilitado — use paths do projeto',
        risk: 'low',
      };
    }

    if (this.pathGuard.isTraversalAttempt(resolved.originalPath)) {
      return {
        ...base,
        allowed: false,
        reason: 'Tentativa de path traversal bloqueada',
        risk: 'critical',
      };
    }

    if (!resolved.isProjectScoped && !this.pathGuard.isDriveAllowed(resolved)) {
      return {
        ...base,
        allowed: false,
        reason: 'Drive não permitido pela configuração',
        risk: 'medium',
      };
    }

    if (this.pathGuard.isSensitivePath(resolved.resolvedPath)) {
      if (operation === 'read' || operation === 'search') {
        return {
          ...base,
          allowed: false,
          reason: 'Arquivo ou diretório sensível bloqueado',
          risk: 'high',
        };
      }
      return {
        ...base,
        allowed: false,
        reason: 'Operação bloqueada em path sensível',
        risk: 'critical',
      };
    }

    if (resolved.accessLevel === 'blocked') {
      const isKnownLabel =
        /^(documentos?|documents?|desktop|downloads?|baixados?|pictures?|imagens?|music|m[uú]sicas?|videos?|v[ií]deos?|home|onedrive)$/i.test(
          resolved.originalPath.trim(),
        );
      return {
        ...base,
        allowed: false,
        reason: isKnownLabel
          ? 'Label de pasta pessoal não pode ser resolvido via project.rootPath — use HostFilesystemDiscovery / caminho absoluto'
          : 'Path fora dos mounts permitidos',
        risk: 'medium',
      };
    }

    const opCheck = this.checkOperation(operation, resolved, ctx);
    if (!opCheck.allowed) return opCheck;

    return {
      ...base,
      allowed: true,
      risk: this.riskForOperation(operation),
      requiresApproval: opCheck.requiresApproval,
    };
  }

  private checkOperation(
    operation: FilesystemOperation,
    resolved: ResolvedPathInfo,
    ctx: FilesystemOperationContext,
  ): FilesystemAccessCheck {
    const base = {
      mode: resolved.mode,
      originalPath: resolved.originalPath,
      resolvedPath: resolved.resolvedPath,
      accessLevel: resolved.accessLevel,
    };

    switch (operation) {
      case 'list':
      case 'stat':
      case 'size_summary':
        if (!this.fsConfig.allowBrowse) {
          return { ...base, allowed: false, reason: 'Browse desabilitado', risk: 'low' };
        }
        return {
          ...base,
          allowed: true,
          risk: operation === 'size_summary' ? 'medium' : 'low',
        };

      case 'read':
      case 'search':
        if (!this.fsConfig.allowRead) {
          return { ...base, allowed: false, reason: 'Leitura desabilitada', risk: 'low' };
        }
        return { ...base, allowed: true, risk: operation === 'search' ? 'medium' : 'low' };

      case 'write':
        if (!this.fsConfig.allowWrite && resolved.accessLevel !== 'read_write_auto') {
          if (
            resolved.accessLevel === 'read_write_approval' ||
            resolved.isProjectScoped
          ) {
            const needsApproval = this.fsConfig.requireApprovalForWrite;
            if (needsApproval && !ctx.approved) {
              return {
                ...base,
                allowed: true,
                requiresApproval: true,
                risk: 'high',
              };
            }
            return { ...base, allowed: true, risk: 'high' };
          }
          return {
            ...base,
            allowed: false,
            reason: 'Escrita desabilitada — habilite HOST_FILESYSTEM_ALLOW_WRITE',
            risk: 'high',
          };
        }
        return {
          ...base,
          allowed: true,
          requiresApproval: this.fsConfig.requireApprovalForWrite && !ctx.approved,
          risk: 'high',
        };

      case 'delete':
        if (!ctx.approved && this.fsConfig.requireApprovalForDelete) {
          return {
            ...base,
            allowed: true,
            requiresApproval: true,
            risk: 'critical',
          };
        }
        return { ...base, allowed: true, risk: 'critical' };

      default:
        return { ...base, allowed: false, reason: 'Operação desconhecida', risk: 'low' };
    }
  }

  private riskForOperation(operation: FilesystemOperation): string {
    switch (operation) {
      case 'delete':
        return 'critical';
      case 'write':
        return 'high';
      case 'search':
        return 'medium';
      default:
        return 'low';
    }
  }
}
