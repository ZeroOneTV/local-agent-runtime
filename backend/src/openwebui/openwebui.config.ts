import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OpenWebuiConfigService {
  constructor(private readonly config: ConfigService) {}

  get apiKey(): string {
    return this.config.get<string>('openwebui.apiKey') || 'local-dev-key';
  }

  get requireApiKey(): boolean {
    return this.config.get<boolean>('openwebui.requireApiKey') ?? false;
  }

  get webhookUrls(): string[] {
    const raw = this.config.get<string>('openwebui.webhookUrls') || '';
    return raw
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
  }

  get logicalModelsRaw(): string {
    return (
      this.config.get<string>('openwebui.logicalModels') ||
      'local-assistant|Local Assistant|00000000-0000-4000-8000-000000000001'
    );
  }

  get apiKeyProjectMapRaw(): string {
    return this.config.get<string>('openwebui.apiKeyProjectMap') || '';
  }

  get approvalsBaseUrl(): string {
    return this.config.get<string>('openwebui.approvalsBaseUrl') || 'http://localhost:3001';
  }
}
