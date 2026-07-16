import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { GrantScopeType, GrantType } from './types/agentic-action.types';

@Injectable()
export class ToolGrantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  get enabled(): boolean {
    return this.config.get<boolean>('agentic.grantsEnabled') ?? true;
  }

  async create(data: {
    projectId: string;
    conversationId?: string;
    userId?: string;
    toolName: string;
    grantType: GrantType;
    scopeType: GrantScopeType;
    pathPrefix?: string;
    commandPattern?: string;
    riskLevel: string;
    ttlHours?: number;
    metadata?: Record<string, unknown>;
  }) {
    if (!this.enabled) {
      throw new Error('Tool grants desabilitados');
    }

    const defaultTtl = this.config.get<number>('agentic.grantsDefaultTtlHours') ?? 24;
    const ttlHours = data.ttlHours ?? defaultTtl;
    const expiresAt =
      data.grantType === 'allow_once'
        ? new Date(Date.now() + 60 * 60 * 1000)
        : new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    return this.prisma.toolPermissionGrant.create({
      data: {
        projectId: data.projectId,
        conversationId: data.conversationId,
        userId: data.userId,
        toolName: data.toolName,
        grantType: data.grantType,
        scopeType: data.scopeType,
        pathPrefix: data.pathPrefix,
        commandPattern: data.commandPattern,
        riskLevel: data.riskLevel,
        expiresAt,
        metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async findMatchingGrant(params: {
    projectId: string;
    conversationId?: string;
    toolName: string;
    path?: string;
    grantType?: GrantType;
  }) {
    if (!this.enabled) return null;

    const now = new Date();
    const grants = await this.prisma.toolPermissionGrant.findMany({
      where: {
        projectId: params.projectId,
        toolName: params.toolName,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        ...(params.grantType ? { grantType: params.grantType } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const grant of grants) {
      if (grant.grantType === 'deny' || grant.grantType === 'always_allow') {
        if (grant.scopeType === 'project') return grant;
        if (
          grant.scopeType === 'conversation' &&
          grant.conversationId &&
          grant.conversationId === params.conversationId
        ) {
          return grant;
        }
        if (grant.scopeType === 'path' && grant.pathPrefix && params.path) {
          const normalizedPath = params.path.replace(/\\/g, '/').toLowerCase();
          const prefix = grant.pathPrefix.replace(/\\/g, '/').toLowerCase();
          if (normalizedPath === prefix || normalizedPath.startsWith(prefix + '/')) {
            return grant;
          }
        }
        if (grant.scopeType === 'session' || grant.scopeType === 'single_call') {
          if (grant.conversationId === params.conversationId) return grant;
        }
      }
    }

    return null;
  }

  async list(projectId?: string) {
    return this.prisma.toolPermissionGrant.findMany({
      where: {
        revokedAt: null,
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async revoke(id: string) {
    try {
      return await this.prisma.toolPermissionGrant.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
    } catch {
      throw new NotFoundException('Grant não encontrado');
    }
  }
}
