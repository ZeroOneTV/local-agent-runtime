import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AgenticAction,
  ApprovalAction,
} from './types/agentic-action.types';

@Injectable()
export class ApprovalMessageRendererService {
  constructor(private readonly config: ConfigService) {}

  get baseUrl(): string {
    return (
      this.config.get<string>('agentic.approvalBaseUrl') ||
      this.config.get<string>('openwebui.approvalsBaseUrl') ||
      'http://localhost:3001'
    );
  }

  renderPending(params: {
    toolCallId: string;
    action: AgenticAction;
    risk: string;
    reason: string;
    grantOptions?: ApprovalAction[];
  }): string {
    const { toolCallId, action, risk, reason, grantOptions } = params;
    const pathOrCmd =
      action.path ||
      action.command ||
      (action.args.path as string) ||
      (action.args.command as string) ||
      '';

    const options = grantOptions || ['allow_once', 'deny'];
    const links = options
      .map((opt) => this.linkFor(opt, toolCallId))
      .filter(Boolean)
      .join('\n');

    return [
      '### Aprovação necessária',
      '',
      'Quero executar uma ação no seu computador:',
      '',
      `**Tool:** \`${action.toolName}\``,
      pathOrCmd ? `**Alvo:** \`${pathOrCmd}\`` : null,
      `**Risco:** \`${risk}\``,
      `**Motivo:** ${reason}`,
      '',
      'Opções:',
      '',
      links,
      '',
      `Ou abra a página: ${this.baseUrl}/approvals`,
    ]
      .filter((l) => l !== null)
      .join('\n');
  }

  renderDenied(toolName: string, reason: string, path?: string): string {
    return [
      'Não consegui executar essa ação porque a política de segurança bloqueou.',
      '',
      `**Tool:** \`${toolName}\``,
      path ? `**Path:** \`${path}\`` : null,
      `**Motivo:** ${reason}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  renderAutoSummary(toolName: string, summary: string): string {
    return `### Resultado de \`${toolName}\`\n\n${summary}`;
  }

  private linkFor(action: ApprovalAction, toolCallId: string): string {
    const base = this.baseUrl;
    switch (action) {
      case 'allow_once':
        return `- [Permitir uma vez](${base}/approvals/${toolCallId}/allow-once)`;
      case 'always_conversation':
        return `- [Sempre permitir nesta conversa](${base}/approvals/${toolCallId}/always-allow?scope=conversation)`;
      case 'always_path':
        return `- [Sempre permitir neste caminho](${base}/approvals/${toolCallId}/always-allow?scope=path)`;
      case 'always_project':
        return `- [Sempre permitir neste projeto](${base}/approvals/${toolCallId}/always-allow?scope=project)`;
      case 'deny':
        return `- [Negar](${base}/approvals/${toolCallId}/deny)`;
      default:
        return '';
    }
  }
}
