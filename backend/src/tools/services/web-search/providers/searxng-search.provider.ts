import {
  WebSearchProvider,
  WebSearchQuery,
  WebSearchResult,
  WebSearchUnavailableError,
} from '../web-search.types';

interface SearxngResultItem {
  title?: string;
  url?: string;
  content?: string;
  engine?: string;
}

interface SearxngResponse {
  results?: SearxngResultItem[];
}

/**
 * Self-hosted meta-search (recommended default). No user query leaves the
 * operator's own infrastructure. The SearXNG instance must have the `json`
 * format enabled in `search.formats` (settings.yml) — it is off by default.
 */
export class SearxngSearchProvider implements WebSearchProvider {
  readonly name = 'searxng';

  constructor(private readonly baseUrl: string) {}

  isAvailable(): boolean {
    return !!this.baseUrl;
  }

  async search(query: WebSearchQuery): Promise<WebSearchResult[]> {
    if (!this.baseUrl) {
      throw new WebSearchUnavailableError(
        'WEB_SEARCH_SEARXNG_URL não configurada.',
      );
    }

    const endpoint = new URL('/search', this.baseUrl);
    endpoint.searchParams.set('q', query.query);
    endpoint.searchParams.set('format', 'json');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), query.timeoutMs);
    let response: Response;
    try {
      response = await fetch(endpoint.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(
        `SearXNG respondeu ${response.status}. Verifique se o formato JSON está ` +
          'habilitado em search.formats no settings.yml da instância.',
      );
    }

    const data = (await response.json()) as SearxngResponse;
    const items = data.results ?? [];
    return items.slice(0, query.maxResults).map((r) => ({
      title: r.title || r.url || '(sem título)',
      url: r.url || '',
      snippet: r.content || '',
      source: r.engine || 'searxng',
    }));
  }
}
