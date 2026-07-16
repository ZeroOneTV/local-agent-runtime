import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { ToolGrantService } from './tool-grant.service';
import {
  AgenticAction,
  AgenticPolicyDecision,
  ApprovalAction,
} from './types/agentic-action.types';

/** Session-level autonomy, derived from config (TOOL_EXECUTION_MODE). */
export type ExecutionModeLevel = 'safe' | 'assisted' | 'autonomous';

export interface AgenticEvaluateContext {
  projectId: string;
  conversationId: string;
  userId?: string;
  /** Project rootPath for sandbox detection (writes inside it may auto-run). */
  projectRoot?: string;
  /** Override the session execution mode (defaults to config). */
  executionMode?: ExecutionModeLevel;
}

@Injectable()
export class AgenticToolPolicyService {
  constructor(
    private readonly config: ConfigService,
    private readonly registry: ToolRegistryService,
    private readonly grants: ToolGrantService,
  ) {}

  get enabled(): boolean {
    return this.config.get<boolean>('agentic.enabled') ?? true;
  }

  get autoExecuteReadonly(): boolean {
    return this.config.get<boolean>('agentic.autoExecuteReadonly') ?? true;
  }

  /** Map TOOL_EXECUTION_MODE (config) to a normalized autonomy level. */
  get executionMode(): ExecutionModeLevel {
    const raw = (
      this.config.get<string>('security.toolExecutionMode') || 'approval_required'
    ).toLowerCase();
    if (raw === 'autonomous' || raw === 'auto') return 'autonomous';
    if (raw === 'safe' || raw === 'readonly') return 'safe';
    return 'assisted';
  }

  get requireApprovalForWrite(): boolean {
    return this.config.get<boolean>('agentic.requireApprovalForWrite') ?? true;
  }

  get requireApprovalForDelete(): boolean {
    return this.config.get<boolean>('agentic.requireApprovalForDelete') ?? true;
  }

  get requireApprovalForShell(): boolean {
    return this.config.get<boolean>('agentic.requireApprovalForShell') ?? true;
  }

  get requireApprovalForExternal(): boolean {
    return this.config.get<boolean>('agentic.requireApprovalForExternal') ?? true;
  }

  get projectSandboxAutoWrite(): boolean {
    return this.config.get<boolean>('agentic.projectSandboxAutoWrite') ?? true;
  }

  async evaluate(
    action: AgenticAction,
    ctx: AgenticEvaluateContext,
  ): Promise<AgenticPolicyDecision> {
    if (!this.enabled) {
      return { decision: 'skip', risk: action.risk, reason: 'Agentic tool use desabilitado' };
    }

    const definition = this.registry.getDefinition(action.toolName);
    if (!definition) {
      return {
        decision: 'deny',
        risk: action.risk,
        reason: `Tool desconhecida: ${action.toolName}`,
      };
    }

    const risk = definition.riskLevel || action.risk;
    const targetPath = action.path || (action.args.path as string | undefined);

    // 1. Explicit user grants take precedence.
    const denyGrant = await this.grants.findMatchingGrant({
      projectId: ctx.projectId,
      conversationId: ctx.conversationId,
      toolName: action.toolName,
      path: targetPath,
      grantType: 'deny',
    });
    if (denyGrant) {
      return {
        decision: 'deny',
        risk,
        reason: 'Negado por grant do usuário',
        grantId: denyGrant.id,
      };
    }

    const allowGrant = await this.grants.findMatchingGrant({
      projectId: ctx.projectId,
      conversationId: ctx.conversationId,
      toolName: action.toolName,
      path: targetPath,
      grantType: 'always_allow',
    });
    if (allowGrant) {
      return {
        decision: 'auto_execute',
        risk,
        reason: 'Permitido por grant existente',
        grantId: allowGrant.id,
      };
    }

    // Read-only classification comes from the tool registry (definition.kind),
    // not a redundant hardcoded list.
    const isReadonly = definition.kind === 'readonly';
    const mode = ctx.executionMode ?? this.executionMode;

    // 2. Safe mode: nothing but read-only auto-runs; everything else is reviewed.
    if (mode === 'safe' && !isReadonly) {
      return {
        decision: 'pending_approval',
        risk,
        reason: 'Modo safe: toda ação de escrita/execução é revisada por você.',
        grantOptions: this.grantOptionsForRisk(risk, action.toolName),
      };
    }

    // 3. Deep recursive size_summary can be slow → confirm.
    if (action.toolName === 'size_summary' && action.args.recursive === true) {
      return {
        decision: 'pending_approval',
        risk: 'medium',
        reason:
          'Cálculo recursivo profundo pode ser lento. Confirme para continuar (ou peça só o resumo superficial).',
        grantOptions: this.grantOptionsForRisk('medium', action.toolName),
      };
    }

    // 4. Read-only low-risk auto-executes (any mode).
    if (this.autoExecuteReadonly && isReadonly && risk === 'low') {
      return {
        decision: 'auto_execute',
        risk,
        reason: 'Read-only low-risk permitido',
      };
    }

    // 5. Write / execution / medium+ → config-driven approval decision.
    const requireApproval = this.requiresApproval(action, definition, risk, mode, ctx);
    if (requireApproval) {
      return {
        decision: 'pending_approval',
        risk,
        reason: action.reason || 'Operação sensível requer aprovação',
        grantOptions: this.grantOptionsForRisk(risk, action.toolName),
      };
    }

    return {
      decision: 'auto_execute',
      risk,
      reason:
        mode === 'autonomous'
          ? 'Autônomo: permitido (dentro do sandbox do projeto)'
          : 'Operação permitida por configuração',
    };
  }

  /**
   * Config-driven approval requirement. Precedence: critical always approves;
   * then the per-kind AGENTIC_REQUIRE_APPROVAL_FOR_* flags; then, in autonomous
   * mode, writes/exec inside the project sandbox may auto-run.
   */
  private requiresApproval(
    action: AgenticAction,
    definition: { kind: string },
    risk: string,
    mode: ExecutionModeLevel,
    ctx: AgenticEvaluateContext,
  ): boolean {
    if (risk === 'critical') return true;

    const flagForKind =
      definition.kind === 'execution'
        ? this.requireApprovalForShell
        : action.toolName === 'delete_file'
          ? this.requireApprovalForDelete
          : definition.kind === 'write'
            ? this.requireApprovalForWrite
            : definition.kind === 'external'
              ? this.requireApprovalForExternal
              : true;

    if (mode === 'autonomous') {
      const inSandbox = this.isInProjectSandbox(action, ctx.projectRoot);
      if (inSandbox && this.projectSandboxAutoWrite && risk !== 'high') {
        return false;
      }
      return flagForKind;
    }

    // assisted (and safe already handled): high risk always approves.
    if (risk === 'high') return true;
    return flagForKind;
  }

  /** True when the target path is relative (project-scoped) or inside rootPath. */
  private isInProjectSandbox(
    action: AgenticAction,
    projectRoot?: string,
  ): boolean {
    const p = action.path || (action.args.path as string | undefined);
    if (!p) return false;
    if (!path.isAbsolute(p)) return true;
    if (!projectRoot) return false;
    const norm = path.resolve(p).toLowerCase();
    const root = path.resolve(projectRoot).toLowerCase();
    return norm === root || norm.startsWith(root + path.sep);
  }

  /** Whether a persistent "always allow" grant may be created for this tool. */
  allowsPersistentGrant(toolName: string): boolean {
    return this.registry.allowsPersistentGrant(toolName);
  }

  /** Real risk level of a tool from the registry (defaults to 'medium'). */
  riskOf(toolName: string): string {
    return this.registry.getDefinition(toolName)?.riskLevel ?? 'medium';
  }

  grantOptionsForRisk(risk: string, toolName: string): ApprovalAction[] {
    const persistent = this.registry.allowsPersistentGrant(toolName);
    if (!persistent || risk === 'critical' || risk === 'high') {
      return ['allow_once', 'deny'];
    }
    if (risk === 'medium') {
      return ['allow_once', 'always_conversation', 'deny'];
    }
    return ['allow_once', 'always_path', 'deny'];
  }
}
