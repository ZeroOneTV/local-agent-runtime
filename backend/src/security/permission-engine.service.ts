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

  /**
   * Access/safety gate for a tool call. Decisions about *execution mode* and
   * *human approval* now live entirely in AgenticToolPolicyService (the native
   * tool-calling policy). This engine keeps only what that policy does NOT
   * cover: disabled tools, project ownership/access, and rate limiting.
   * It never asks for approval on its own (`requiresApproval` is always false)
   * so the two engines can't disagree about "modes".
   */
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

    const auditLevel =
      definition.riskLevel === 'critical' || definition.riskLevel === 'high'
        ? 'full'
        : 'basic';

    return { allowed: true, requiresApproval: false, auditLevel };
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
