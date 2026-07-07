import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { ToolDefinition } from '../tools/tools.types';
import { SecurityConfigService } from './security.config';
import { PermissionContext, PermissionDecision } from './security.types';

@Injectable()
export class PermissionEngineService {
  private readonly callCounts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly securityConfig: SecurityConfigService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async evaluate(
    ctx: PermissionContext,
    definition: ToolDefinition,
  ): Promise<PermissionDecision> {
    if (this.securityConfig.disabledTools.includes(ctx.toolName)) {
      return {
        allowed: false,
        code: 'TOOL_DISABLED',
        reason: `Tool desabilitada: ${ctx.toolName}`,
      };
    }

    if (ctx.executionMode === 'safe' && definition.kind !== 'readonly') {
      return {
        allowed: false,
        code: 'SAFE_MODE_READONLY',
        reason: 'Modo safe permite apenas tools de leitura',
      };
    }

    if (ctx.userId) {
      const project = await this.prisma.project.findUnique({
        where: { id: ctx.projectId },
      });
      if (project && project.ownerId !== ctx.userId) {
        return {
          allowed: false,
          code: 'ACCESS_DENIED',
          reason: 'Usuário sem acesso ao projeto',
        };
      }
    }

    if (ctx.conversationId && !this.checkRateLimit(ctx.conversationId)) {
      return {
        allowed: false,
        code: 'RATE_LIMIT',
        reason: 'Limite de chamadas consecutivas atingido',
      };
    }

    const requiresApproval = this.requiresApproval(ctx, definition);

    const auditLevel =
      definition.riskLevel === 'critical' || definition.riskLevel === 'high'
        ? 'full'
        : 'basic';

    return { allowed: true, requiresApproval, auditLevel };
  }

  private requiresApproval(
    ctx: PermissionContext,
    definition: ToolDefinition,
  ): boolean {
    if (ctx.approved) return false;

    if (ctx.executionMode === 'autonomous') {
      if (this.securityConfig.autonomousTools.includes(ctx.toolName)) {
        return false;
      }
    }

    const { riskLevel } = definition;
    if (riskLevel === 'low') return false;
    if (riskLevel === 'critical') return true;
    return true;
  }

  private checkRateLimit(conversationId: string): boolean {
    const max = this.securityConfig.maxConsecutiveCalls;
    const windowMs = 60_000;
    const now = Date.now();

    const entry = this.callCounts.get(conversationId);
    if (!entry || now > entry.resetAt) {
      this.callCounts.set(conversationId, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (entry.count >= max) return false;
    entry.count++;
    return true;
  }
}
