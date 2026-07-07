import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { SecurityConfigService } from './security.config';
import { PolicyContext } from './security.types';

export interface PolicyResult {
  allowed: boolean;
  code?: string;
  reason?: string;
}

@Injectable()
export class PolicyEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityConfig: SecurityConfigService,
    private readonly config: ConfigService,
  ) {}

  async evaluate(ctx: PolicyContext): Promise<PolicyResult> {
    const offline = await this.isProjectOffline(ctx.projectId);
    const isProduction =
      this.config.get<string>('nodeEnv') === 'production' ||
      (await this.isProjectProduction(ctx.projectId));

    if (
      ctx.toolName === 'delete_file' &&
      isProduction &&
      this.securityConfig.blockDeleteInProduction
    ) {
      return {
        allowed: false,
        code: 'POLICY_DELETE_BLOCKED',
        reason: 'Exclusão de arquivos bloqueada em ambiente de produção',
      };
    }

    if (
      ['fetch_url', 'read_web_page'].includes(ctx.toolName) &&
      offline &&
      this.securityConfig.blockBrowserOffline
    ) {
      return {
        allowed: false,
        code: 'POLICY_BROWSER_OFFLINE',
        reason: 'Navegação web bloqueada para projetos offline',
      };
    }

    if (
      ['run_command', 'run_tests', 'run_build'].includes(ctx.toolName) &&
      (await this.hasActiveIndexingJob(ctx.projectId))
    ) {
      return {
        allowed: false,
        code: 'POLICY_INDEXING_ACTIVE',
        reason: 'Terminal bloqueado durante indexação ativa',
      };
    }

    if (ctx.riskLevel === 'critical' && !ctx.approved) {
      const recentCritical = await this.countRecentCriticalCalls(
        ctx.projectId,
        ctx.conversationId,
      );
      if (recentCritical >= 3) {
        return {
          allowed: false,
          code: 'POLICY_CRITICAL_LIMIT',
          reason: 'Muitas operações críticas em sequência — aguarde aprovação',
        };
      }
    }

    return { allowed: true };
  }

  private async isProjectOffline(projectId: string): Promise<boolean> {
    const setting = await this.prisma.setting.findFirst({
      where: { key: `project:${projectId}:offline` },
    });
    return setting?.value === 'true';
  }

  private async isProjectProduction(projectId: string): Promise<boolean> {
    const setting = await this.prisma.setting.findFirst({
      where: { key: `project:${projectId}:environment` },
    });
    return setting?.value === 'production';
  }

  private async hasActiveIndexingJob(projectId: string): Promise<boolean> {
    const job = await this.prisma.job.findFirst({
      where: {
        projectId,
        type: { in: ['index_file', 'index_project'] },
        status: { in: ['pending', 'running'] },
      },
    });
    return !!job;
  }

  private async countRecentCriticalCalls(
    projectId: string,
    conversationId?: string,
  ): Promise<number> {
    const since = new Date(Date.now() - 5 * 60_000);
    return this.prisma.toolAuditLog.count({
      where: {
        projectId,
        conversationId,
        policyBlocked: false,
        success: true,
        createdAt: { gte: since },
        toolName: {
          in: ['delete_file', 'run_command', 'fetch_url', 'write_file'],
        },
      },
    });
  }
}
