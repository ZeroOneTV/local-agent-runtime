import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredToolResult } from '../tools.types';
import { NetGuardService, SsrfBlockedError } from './net-guard.service';

@Injectable()
export class BrowserService {
  constructor(
    private readonly config: ConfigService,
    private readonly netGuard: NetGuardService,
  ) {}

  get fetchEnabled(): boolean {
    return this.config.get<boolean>('web.fetchEnabled') ?? false;
  }

  private get timeout(): number {
    return this.config.get<number>('tools.fetchTimeoutMs') ?? 10000;
  }

  private get maxBytes(): number {
    return this.config.get<number>('web.fetchMaxBytes') ?? 2_000_000;
  }

  private get maxChars(): number {
    return this.config.get<number>('tools.maxOutputChars') ?? 4000;
  }

  async fetchUrl(url: string): Promise<StructuredToolResult> {
    if (!this.fetchEnabled) {
      return {
        success: false,
        error: {
          code: 'WEB_FETCH_DISABLED',
          message:
            'Leitura de páginas web está desabilitada. Peça ao operador para definir WEB_FETCH_ENABLED=true.',
        },
      };
    }

    try {
      const result = await this.netGuard.safeFetch(url, {
        timeoutMs: this.timeout,
        maxBytes: this.maxBytes,
      });

      const charTruncated = result.body.length > this.maxChars;
      const content = charTruncated
        ? result.body.slice(0, this.maxChars)
        : result.body;

      return {
        success: true,
        data: {
          url: result.finalUrl,
          status: result.status,
          content,
        },
        metadata: {
          truncated: result.truncated || charTruncated,
          bytes: result.bytes,
        },
      };
    } catch (e) {
      if (e instanceof SsrfBlockedError) {
        return {
          success: false,
          error: { code: e.code, message: e.message },
        };
      }
      return {
        success: false,
        error: { code: 'FETCH_FAILED', message: `Falha ao buscar URL: ${e}` },
      };
    }
  }
}
