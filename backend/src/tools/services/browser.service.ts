import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredToolResult } from '../tools.types';

const DEFAULT_ALLOWED_HOSTS = ['localhost', '127.0.0.1'];

@Injectable()
export class BrowserService {
  constructor(private readonly config: ConfigService) {}

  private get timeout(): number {
    return this.config.get<number>('tools.fetchTimeoutMs') ?? 10000;
  }

  async fetchUrl(url: string): Promise<StructuredToolResult> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return {
        success: false,
        error: { code: 'INVALID_URL', message: 'URL inválida' },
      };
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        success: false,
        error: { code: 'PROTOCOL_FORBIDDEN', message: 'Apenas HTTP/HTTPS permitidos' },
      };
    }

    const allowedHosts =
      this.config.get<string[]>('tools.allowedFetchHosts') ?? DEFAULT_ALLOWED_HOSTS;

    if (!allowedHosts.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
      return {
        success: false,
        error: {
          code: 'HOST_NOT_ALLOWED',
          message: `Host não permitido: ${parsed.hostname}`,
        },
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      const text = await response.text();
      const maxChars = this.config.get<number>('tools.maxOutputChars') ?? 4000;
      const truncated = text.length > maxChars;

      return {
        success: true,
        data: {
          url,
          status: response.status,
          content: truncated ? text.slice(0, maxChars) : text,
        },
        metadata: { truncated, bytes: text.length },
      };
    } catch (e) {
      return {
        success: false,
        error: { code: 'FETCH_FAILED', message: `Falha ao buscar URL: ${e}` },
      };
    }
  }
}
