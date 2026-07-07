import { Controller, Get, Header, Param, Post } from '@nestjs/common';
import { ToolExecutionService } from '../tools/tool-execution.service';
import { ToolRouterService } from '../tools/tool-router.service';
import { OpenWebuiConfigService } from './openwebui.config';

@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly execution: ToolExecutionService,
    private readonly router: ToolRouterService,
    private readonly config: OpenWebuiConfigService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async listPage() {
    const pending = await this.execution.getAllPending();
    const baseUrl = this.config.approvalsBaseUrl;

    const rows = pending.length
      ? pending
          .map(
            (p) => `
        <tr>
          <td>${p.toolName}</td>
          <td><code>${p.conversationId.slice(0, 8)}…</code></td>
          <td><pre>${JSON.stringify(p.parameters, null, 2)}</pre></td>
          <td>
            <form method="post" action="${baseUrl}/approvals/${p.id}/approve" style="display:inline">
              <button type="submit">Aprovar</button>
            </form>
            <form method="post" action="${baseUrl}/approvals/${p.id}/reject" style="display:inline">
              <button type="submit">Rejeitar</button>
            </form>
          </td>
        </tr>`,
          )
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
    button { margin-right: 0.5rem; padding: 0.4rem 0.8rem; cursor: pointer; }
    pre { white-space: pre-wrap; font-size: 0.85rem; max-width: 320px; }
    h1 { margin-bottom: 0.25rem; }
    p { color: #9aa0a6; }
  </style>
</head>
<body>
  <h1>Aprovações pendentes</h1>
  <p>Ferramentas sensíveis aguardando aprovação humana. Também é possível aprovar via chat respondendo "aprovar" ou "rejeitar".</p>
  <table>
    <thead>
      <tr><th>Tool</th><th>Conversa</th><th>Parâmetros</th><th>Ações</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
  }

  @Post(':toolCallId/approve')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async approve(@Param('toolCallId') toolCallId: string) {
    const result = await this.router.approve(toolCallId);
    return this.resultPage('Aprovado', result);
  }

  @Post(':toolCallId/reject')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async reject(@Param('toolCallId') toolCallId: string) {
    const result = await this.router.reject(toolCallId);
    return this.resultPage('Rejeitado', result);
  }

  private resultPage(title: string, result: unknown) {
    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui;margin:2rem">
  <h1>${title}</h1>
  <pre>${JSON.stringify(result, null, 2)}</pre>
  <p><a href="/approvals">← Voltar</a></p>
</body></html>`;
  }
}
