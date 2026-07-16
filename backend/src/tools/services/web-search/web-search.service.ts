import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredToolResult } from '../../tools.types';
import {
  WebSearchProvider,
  WebSearchResult,
  WebSearchUnavailableError,
} from './web-search.types';
import { DisabledSearchProvider } from './providers/disabled-search.provider';
import { SearxngSearchProvider } from './providers/searxng-search.provider';
import { BraveSearchProvider } from './providers/brave-search.provider';

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);
  private readonly provider: WebSearchProvider;

  constructor(private readonly config: ConfigService) {
    this.provider = this.resolveProvider();
  }

  /** True only when the master switch is on AND the provider is usable. */
  isAvailable(): boolean {
    return this.enabled && this.provider.isAvailable();
  }

  get enabled(): boolean {
    return this.config.get<boolean>('web.searchEnabled') ?? false;
  }

  private get maxResults(): number {
    return this.config.get<number>('web.searchMaxResults') ?? 5;
  }

  private get timeoutMs(): number {
    return this.config.get<number>('web.searchTimeoutMs') ?? 10000;
  }

  private resolveProvider(): WebSearchProvider {
    const name = (this.config.get<string>('web.searchProvider') || 'disabled').toLowerCase();
    switch (name) {
      case 'searxng':
        return new SearxngSearchProvider(
          this.config.get<string>('web.searxngUrl') || '',
        );
      case 'brave':
        return new BraveSearchProvider(
          this.config.get<string>('web.braveApiKey') || '',
        );
      default:
        return new DisabledSearchProvider();
    }
  }

  async search(
    query: string,
    maxResults?: number,
  ): Promise<StructuredToolResult> {
    if (!this.enabled) {
      return {
        success: false,
        error: {
          code: 'WEB_SEARCH_DISABLED',
          message:
            'Busca na internet está desabilitada. Peça ao operador para definir ' +
            'WEB_SEARCH_ENABLED=true e configurar WEB_SEARCH_PROVIDER.',
        },
      };
    }

    const trimmed = (query || '').trim();
    if (!trimmed) {
      return {
        success: false,
        error: { code: 'INVALID_QUERY', message: 'Query de busca vazia.' },
      };
    }

    const limit = Math.min(
      Math.max(maxResults ?? this.maxResults, 1),
      this.maxResults,
    );

    try {
      const results: WebSearchResult[] = await this.provider.search({
        query: trimmed,
        maxResults: limit,
        timeoutMs: this.timeoutMs,
      });
      return {
        success: true,
        data: { query: trimmed, provider: this.provider.name, results },
        metadata: { count: results.length },
      };
    } catch (e) {
      const code =
        e instanceof WebSearchUnavailableError
          ? 'WEB_SEARCH_UNAVAILABLE'
          : 'WEB_SEARCH_FAILED';
      this.logger.warn(`web_search (${this.provider.name}) falhou: ${String(e)}`);
      return {
        success: false,
        error: {
          code,
          message: e instanceof Error ? e.message : String(e),
        },
      };
    }
  }
}
