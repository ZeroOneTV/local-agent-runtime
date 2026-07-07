import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolExecutionService } from './tool-execution.service';
import { PermissionEngineService } from '../security/permission-engine.service';
import { PolicyEngineService } from '../security/policy-engine.service';
import { AuditService } from '../security/audit.service';
import { resolveApprovedBy, resolveUserId } from '../common/approval.util';
import { ExecutionMode } from '../security/security.types';
import {
  ExecuteToolRequest,
  ExecuteToolResponse,
  StructuredToolResult,
  ToolExecutionContext,
} from './tools.types';

@Injectable()
export class ToolRouterService {
  private readonly logger = new Logger(ToolRouterService.name);

  constructor(
    private readonly registry: ToolRegistryService,
    private readonly execution: ToolExecutionService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly permission: PermissionEngineService,
    private readonly policy: PolicyEngineService,
    private readonly audit: AuditService,
  ) {}

  async route(request: ExecuteToolRequest): Promise<ExecuteToolResponse> {
    const definition = this.registry.getDefinition(request.tool);
    if (!definition) {
      throw new NotFoundException(`Tool desconhecida: ${request.tool}`);
    }

    const inputError = this.registry.validateInput(definition, request.args);
    if (inputError) {
      throw new BadRequestException(inputError);
    }

    const project = await this.prisma.project.findUnique({
      where: { id: request.projectId },
    });
    if (!project) {
      throw new NotFoundException('Projeto não encontrado');
    }

    const executionMode = (project.executionMode || 'developer') as ExecutionMode;
    const rootPath =
      project.rootPath ||
      this.config.get<string>('storage.projects') ||
      '/storage/projects';

    const permissionCtx = {
      projectId: request.projectId,
      conversationId: request.conversationId,
      userId: request.userId,
      toolName: request.tool,
      riskLevel: definition.riskLevel,
      toolKind: definition.kind,
      executionMode,
      approved: request.approved ?? false,
    };

    const permissionDecision = await this.permission.evaluate(
      permissionCtx,
      definition,
    );

    if (!permissionDecision.allowed) {
      await this.audit.log({
        projectId: request.projectId,
        conversationId: request.conversationId,
        userId: request.userId,
        toolName: request.tool,
        parameters: request.args,
        success: false,
        approved: false,
        errorCode: permissionDecision.code,
        policyBlocked: true,
      });
      throw new ForbiddenException(permissionDecision.reason);
    }

    const policyResult = await this.policy.evaluate({
      projectId: request.projectId,
      conversationId: request.conversationId,
      toolName: request.tool,
      riskLevel: definition.riskLevel,
      toolKind: definition.kind,
      executionMode,
      approved: request.approved ?? false,
      args: request.args,
    });

    if (!policyResult.allowed) {
      await this.audit.log({
        projectId: request.projectId,
        conversationId: request.conversationId,
        userId: request.userId,
        toolName: request.tool,
        parameters: request.args,
        success: false,
        approved: false,
        errorCode: policyResult.code,
        policyBlocked: true,
      });
      throw new ForbiddenException(policyResult.reason);
    }

    const shellBlocked = this.checkShellEnabled(request.tool);
    if (shellBlocked) {
      return this.blockedResponse(
        request,
        shellBlocked,
        'SHELL_DISABLED',
      );
    }

    const ctx: ToolExecutionContext = {
      projectId: request.projectId,
      conversationId: request.conversationId,
      userId: request.userId,
      rootPath,
      approved: request.approved ?? false,
      approvedBy: request.approvedBy,
      executionMode,
    };

    if (permissionDecision.requiresApproval && !ctx.approved) {
      let toolCallId: string | undefined;

      if (request.conversationId) {
        const call = await this.execution.createCall(
          request.conversationId,
          request.tool,
          request.args,
          'pending',
        );
        toolCallId = call.id;
      }

      await this.audit.log({
        projectId: request.projectId,
        conversationId: request.conversationId,
        toolCallId,
        userId: request.userId,
        toolName: request.tool,
        parameters: request.args,
        approved: false,
      });

      return {
        toolCallId,
        status: 'pending',
        requiresApproval: true,
        message: `A LLM quer executar: ${request.tool}(${JSON.stringify(request.args)}). Aprovar?`,
      };
    }

    return this.runTool(definition.name, request.args, ctx, request.conversationId);
  }

  async approve(
    toolCallId: string,
    approvedBy?: string,
  ): Promise<ExecuteToolResponse> {
    const call = await this.prisma.toolCall.findUnique({
      where: { id: toolCallId },
      include: { conversation: true },
    });

    if (!call || call.status !== 'pending') {
      throw new NotFoundException('Tool call pendente não encontrada');
    }

    const resolvedApprovedBy = resolveApprovedBy(approvedBy);

    await this.prisma.toolCall.update({
      where: { id: toolCallId },
      data: { status: 'approved', approvedBy: resolvedApprovedBy, approvedAt: new Date() },
    });

    const project = await this.prisma.project.findUnique({
      where: { id: call.conversation.projectId },
    });

    const rootPath =
      project?.rootPath ||
      this.config.get<string>('storage.projects') ||
      '/storage/projects';

    return this.runTool(
      call.toolName,
      call.parameters as Record<string, unknown>,
      {
        projectId: call.conversation.projectId,
        conversationId: call.conversationId,
        rootPath,
        approved: true,
        approvedBy: resolvedApprovedBy,
        executionMode: project?.executionMode || 'developer',
      },
      call.conversationId,
      toolCallId,
    );
  }

  async reject(toolCallId: string, userId?: string): Promise<ExecuteToolResponse> {
    const resolvedUserId = resolveUserId(userId);

    await this.execution.setStatus(toolCallId, 'rejected');

    const call = await this.prisma.toolCall.findUnique({
      where: { id: toolCallId },
      include: { conversation: true },
    });

    if (call) {
      await this.audit.log({
        projectId: call.conversation.projectId,
        conversationId: call.conversationId,
        toolCallId,
        userId: resolvedUserId,
        toolName: call.toolName,
        parameters: call.parameters as Record<string, unknown>,
        success: false,
        approved: false,
        errorCode: 'REJECTED',
      });
    }

    return { toolCallId, status: 'rejected', message: 'Execução rejeitada pelo usuário' };
  }

  private checkShellEnabled(toolName: string): StructuredToolResult | null {
    if (
      ['run_command', 'run_tests', 'run_build'].includes(toolName) &&
      !this.config.get<boolean>('security.allowShellCommands')
    ) {
      return {
        success: false,
        error: {
          code: 'SHELL_DISABLED',
          message:
            'Execução de comandos shell desabilitada (ALLOW_SHELL_COMMANDS=false)',
        },
      };
    }
    return null;
  }

  private async blockedResponse(
    request: ExecuteToolRequest,
    result: StructuredToolResult,
    errorCode: string,
  ): Promise<ExecuteToolResponse> {
    await this.audit.log({
      projectId: request.projectId,
      conversationId: request.conversationId,
      userId: request.userId,
      toolName: request.tool,
      parameters: request.args,
      result,
      success: false,
      approved: false,
      errorCode,
    });
    return { status: 'error', result };
  }

  private async runTool(
    toolName: string,
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
    conversationId?: string,
    existingCallId?: string,
  ): Promise<ExecuteToolResponse> {
    const handler = this.registry.getHandler(toolName);
    if (!handler) {
      throw new NotFoundException(`Handler não encontrado: ${toolName}`);
    }

    const definition = this.registry.getDefinition(toolName)!;

    let toolCallId = existingCallId;

    if (conversationId && !toolCallId) {
      const call = await this.execution.createCall(
        conversationId,
        toolName,
        args,
        'running',
      );
      toolCallId = call.id;
    } else if (toolCallId) {
      await this.execution.markRunning(toolCallId);
    }

    const start = Date.now();
    this.logger.log(`Executando tool: ${toolName}`);

    let result: StructuredToolResult;
    try {
      result = await handler.execute(args, ctx);
    } catch (e) {
      result = {
        success: false,
        error: { code: 'EXECUTION_ERROR', message: String(e) },
      };
    }

    const executionTime = Date.now() - start;

    if (definition.async && result.metadata?.async) {
      await this.audit.log({
        projectId: ctx.projectId,
        conversationId,
        toolCallId,
        userId: ctx.userId,
        toolName,
        parameters: args,
        result,
        success: true,
        executionTime,
        approved: ctx.approved,
        approvedBy: ctx.approvedBy,
      });

      return {
        toolCallId,
        status: 'running',
        result,
        jobId: (result.data as { jobId?: string })?.jobId,
        message: 'Tool assíncrona enfileirada',
      };
    }

    return this.persistAndReturn(
      ctx,
      toolName,
      args,
      result,
      toolCallId,
      executionTime,
    );
  }

  private async persistAndReturn(
    ctx: ToolExecutionContext,
    toolName: string,
    args: Record<string, unknown>,
    result: StructuredToolResult,
    toolCallId?: string,
    executionTime = 0,
  ): Promise<ExecuteToolResponse> {
    if (ctx.conversationId) {
      if (!toolCallId) {
        const call = await this.execution.createCall(
          ctx.conversationId,
          toolName,
          args,
          result.success ? 'success' : 'error',
        );
        toolCallId = call.id;
      }

      await this.execution.completeCall(toolCallId, result, executionTime);
    }

    await this.audit.log({
      projectId: ctx.projectId,
      conversationId: ctx.conversationId,
      toolCallId,
      userId: ctx.userId,
      toolName,
      parameters: args,
      result,
      success: result.success,
      executionTime,
      approved: ctx.approved,
      approvedBy: ctx.approvedBy,
      errorCode: result.error?.code,
    });

    return {
      toolCallId,
      status: result.success ? 'success' : 'error',
      result,
    };
  }
}
