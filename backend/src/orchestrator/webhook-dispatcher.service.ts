import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrchestratorEventType } from './event.service';

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(private readonly config: ConfigService) {}

  async dispatch(
    type: OrchestratorEventType,
    projectId: string,
    conversationId: string | undefined,
    payload?: unknown,
  ): Promise<void> {
    const raw = this.config.get<string>('openwebui.webhookUrls') || '';
    const urls = raw
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    if (!urls.length) return;

    const body = {
      event: type,
      projectId,
      conversationId,
      payload,
      timestamp: new Date().toISOString(),
    };

    await Promise.allSettled(
      urls.map(async (url) => {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!response.ok) {
            this.logger.warn(`Webhook ${url} retornou ${response.status}`);
          }
        } catch (error) {
          this.logger.warn(`Falha ao enviar webhook para ${url}`, error);
        }
      }),
    );
  }
}
