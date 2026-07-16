import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { ToolRouterService } from '../tools/tool-router.service';
import { ToolExecutionService } from '../tools/tool-execution.service';
import { AuditService } from '../security/audit.service';
import { ToolGrantService } from './tool-grant.service';
import { ApprovalMessageRendererService } from './approval-message-renderer.service';
import { AgenticToolPolicyService } from './agentic-tool-policy.service';
import {
  AgenticAction,
  ApprovalAction,
  GrantScopeType,
} from './types/agentic-action.types';
import { resolveApprovedBy } from '../common/approval.util';

@Injectable()
export class ToolApprovalService {
  private readonly logger = new Logger(ToolApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolRouter: ToolRouterService,
    private readonly execution: ToolExecutionService,
    private readonly audit: AuditService,
    private readonly grants: ToolGrantService,
    private readonly renderer: ApprovalMessageRendererService,
    private readonly policy: AgenticToolPolicyService,
    private readonly config: ConfigService,
  ) {}

  async createPending(params: {
    action: AgenticAction;
    projectId: string;
    conversationId: string;
    userId?: string;
    risk: string;
    reason: string;
    grantOptions?: ApprovalAction[];
  }) {
    const call = await this.execution.createCall(
      params.conversationId,
      params.action.toolName,
      params.action.args,
      'pending',
    );

    await this.audit.log({
      projectId: params.projectId,
      conversationId: params.conversationId,
      toolCallId: call.id,
      userId: params.userId,
      toolName: params.action.toolName,
      parameters: {
        ...params.action.args,
        _agentic: {
          decision: 'pending_approval',
          risk: params.risk,
          reason: params.reason,
        },
      },
      approved: false,
    });

    const message = this.renderer.renderPending({
      toolCallId: call.id,
      action: params.action,
      risk: params.risk,
      reason: params.reason,
      grantOptions: params.grantOptions,
    });

    return { toolCallId: call.id, message };
  }

  async allowOnce(toolCallId: string, approvedBy?: string) {
    return this.toolRouter.approve(toolCallId, approvedBy);
  }

  async alwaysAllow(
    toolCallId: string,
    scope: 'conversation' | 'path' | 'project' = 'conversation',
    approvedBy?: string,
  ) {
    const call = await this.prisma.toolCall.findUnique({
      where: { id: toolCallId },
      include: { conversation: true },
    });
    if (!call || call.status !== 'pending') {
      throw new NotFoundException('Tool call pendente não encontrada');
    }

    const params = call.parameters as Record<string, unknown>;
    const pathPrefix = (params.path as string) || undefined;
    const risk = this.policy.riskOf(call.toolName);

    // Tools that forbid persistent grants: only allow_once / conversation w/ short TTL
    const critical = !this.policy.allowsPersistentGrant(call.toolName);
    const scopeType: GrantScopeType = critical
      ? 'conversation'
      : scope === 'path'
        ? 'path'
        : scope === 'project'
          ? 'project'
          : 'conversation';

    const grant = await this.grants.create({
      projectId: call.conversation.projectId,
      conversationId: call.conversationId,
      userId: resolveApprovedBy(approvedBy),
      toolName: call.toolName,
      grantType: 'always_allow',
      scopeType: critical ? 'conversation' : scopeType,
      pathPrefix: scopeType === 'path' ? pathPrefix : undefined,
      riskLevel: risk,
      ttlHours: critical ? 2 : undefined,
      metadata: { fromToolCallId: toolCallId, requestedScope: scope },
    });

    this.logger.log(`Grant created ${grant.id} for ${call.toolName} scope=${grant.scopeType}`);

    const result = await this.toolRouter.approve(toolCallId, approvedBy);
    return { ...result, grantId: grant.id };
  }

  async deny(toolCallId: string, userId?: string) {
    return this.toolRouter.reject(toolCallId, userId);
  }

  async getPending(conversationId?: string) {
    if (conversationId) {
      return this.execution.getPending(conversationId);
    }
    return this.execution.getAllPending();
  }

  async getById(toolCallId: string) {
    const call = await this.prisma.toolCall.findUnique({
      where: { id: toolCallId },
      include: { result: true, conversation: true },
    });
    if (!call) throw new NotFoundException('Tool call não encontrada');
    return call;
  }
}
