import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ToolApprovalService } from './tool-approval.service';
import { ToolGrantService } from './tool-grant.service';
import { ConfigService } from '@nestjs/config';

@Controller('approvals')
export class AgenticApprovalsController {
  constructor(
    private readonly approvals: ToolApprovalService,
    private readonly grants: ToolGrantService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async listPage() {
    const pending = await this.approvals.getPending();
    const baseUrl =
      this.config.get<string>('agentic.approvalBaseUrl') ||
      this.config.get<string>('openwebui.approvalsBaseUrl') ||
      'http://localhost:3001';

    const rows = pending.length
      ? pending
          .map((p) => {
            const params = JSON.stringify(p.parameters, null, 2);
            const riskHint = this.riskFromTool(p.toolName);
            return `
        <tr>
          <td><strong>${this.escape(p.toolName)}</strong><br/><small>risco: ${riskHint}</small></td>
          <td><code>${p.conversationId.slice(0, 8)}…</code></td>
          <td><pre>${this.escape(params)}</pre></td>
          <td class="actions">
            <form method="post" action="${baseUrl}/approvals/${p.id}/allow-once">
              <button type="submit" class="ok">Permitir uma vez</button>
            </form>
            <form method="post" action="${baseUrl}/approvals/${p.id}/always-allow?scope=conversation">
              <button type="submit">Sempre nesta conversa</button>
            </form>
            <form method="post" action="${baseUrl}/approvals/${p.id}/always-allow?scope=path">
              <button type="submit">Sempre neste caminho</button>
            </form>
            <form method="post" action="${baseUrl}/approvals/${p.id}/deny">
              <button type="submit" class="deny">Negar</button>
            </form>
          </td>
        </tr>`;
          })
          .join('')
      : '<tr><td colspan="4">Nenhuma aprovação pendente.</td></tr>';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Aprovações — Local AI Assistant</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; background: #0f1117; color: #e8eaed; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #333; padding: 0.75rem; vertical-align: top; }
    th { background: #1a1d27; }
    button { margin: 0.2rem 0.4rem 0.2rem 0; padding: 0.4rem 0.8rem; cursor: pointer; border-radius: 4px; border: 1px solid #444; background: #222; color: #eee; }
    button.ok { background: #1b5e20; border-color: #2e7d32; }
    button.deny { background: #5d1a1a; border-color: #8b0000; }
    pre { white-space: pre-wrap; font-size: 0.85rem; max-width: 360px; max-height: 200px; overflow: auto; }
    h1 { margin-bottom: 0.25rem; }
    p { color: #9aa0a6; }
    .warn { background: #2a2200; border: 1px solid #665c00; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
    .actions form { display: inline; }
  </style>
</head>
<body>
  <h1>Aprovações pendentes</h1>
  <p>O backend controla tools e permissões. Open WebUI apenas exibe a conversa.</p>
  <div class="warn">⚠️ Escrita, deleção e shell nunca rodam automaticamente. Revise path/comando antes de aprovar.</div>
  <table>
    <thead>
      <tr><th>Tool</th><th>Conversa</th><th>Parâmetros</th><th>Ações</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:1.5rem"><a href="${baseUrl}/approvals/grants" style="color:#8ab4f8">Ver grants ativos →</a></p>
</body>
</html>`;
  }

  @Get('pending')
  async pendingJson(@Query('conversationId') conversationId?: string) {
    return this.approvals.getPending(conversationId);
  }

  @Get('grants')
  async listGrants(@Query('projectId') projectId?: string) {
    return this.grants.list(projectId);
  }

  @Get(':toolCallId')
  async getOne(@Param('toolCallId') toolCallId: string) {
    return this.approvals.getById(toolCallId);
  }

  @Get(':toolCallId/allow-once')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async allowOnceGet(@Param('toolCallId') toolCallId: string) {
    return this.allowOnce(toolCallId);
  }

  @Post(':toolCallId/allow-once')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async allowOnce(@Param('toolCallId') toolCallId: string) {
    const result = await this.approvals.allowOnce(toolCallId);
    return this.resultPage('Permitido uma vez', result);
  }

  @Get(':toolCallId/always-allow')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async alwaysAllowGet(
    @Param('toolCallId') toolCallId: string,
    @Query('scope') scope?: 'conversation' | 'path' | 'project',
  ) {
    return this.alwaysAllow(toolCallId, scope);
  }

  @Post(':toolCallId/always-allow')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async alwaysAllow(
    @Param('toolCallId') toolCallId: string,
    @Query('scope') scope?: 'conversation' | 'path' | 'project',
  ) {
    const result = await this.approvals.alwaysAllow(
      toolCallId,
      scope || 'conversation',
    );
    return this.resultPage('Sempre permitir (grant criado)', result);
  }

  @Get(':toolCallId/deny')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async denyGet(@Param('toolCallId') toolCallId: string) {
    return this.deny(toolCallId);
  }

  @Post(':toolCallId/deny')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async deny(@Param('toolCallId') toolCallId: string) {
    const result = await this.approvals.deny(toolCallId);
    return this.resultPage('Negado', result);
  }

  /** Compat com links antigos */
  @Post(':toolCallId/approve')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async approveCompat(@Param('toolCallId') toolCallId: string) {
    return this.allowOnce(toolCallId);
  }

  @Post(':toolCallId/reject')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async rejectCompat(@Param('toolCallId') toolCallId: string) {
    return this.deny(toolCallId);
  }

  @Delete('grants/:id')
  async revokeGrant(@Param('id') id: string) {
    return this.grants.revoke(id);
  }

  @Post(':toolCallId/revoke-grant')
  async revokeFromCall(
    @Param('toolCallId') toolCallId: string,
    @Body() body: { grantId?: string },
  ) {
    if (!body.grantId) {
      return { error: 'grantId obrigatório' };
    }
    return this.grants.revoke(body.grantId);
  }

  private resultPage(title: string, result: unknown) {
    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui;margin:2rem;background:#0f1117;color:#e8eaed}a{color:#8ab4f8}</style>
</head>
<body>
  <h1>${title}</h1>
  <pre>${this.escape(JSON.stringify(result, null, 2))}</pre>
  <p><a href="/approvals">← Voltar</a></p>
</body></html>`;
  }

  private escape(s: string) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private riskFromTool(tool: string): string {
    if (['delete_file', 'run_command', 'run_tests', 'run_build'].includes(tool))
      return 'critical';
    if (['write_file', 'apply_patch', 'promote_media_to_project'].includes(tool))
      return 'high';
    return 'medium';
  }
}
