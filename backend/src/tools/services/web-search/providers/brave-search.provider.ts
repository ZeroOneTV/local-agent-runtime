import {
  WebSearchProvider,
  WebSearchQuery,
  WebSearchResult,
  WebSearchUnavailableError,
} from '../web-search.types';

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
}

interface BraveResponse {
  web?: { results?: BraveWebResult[] };
}

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

/**
 * Brave Search API (alternative for operators who don't want to self-host).
 * Requires an API key; the query goes to a third party, so this is the less
 * private option compared to a self-hosted SearXNG instance.
 */
export class BraveSearchProvider implements WebSearchProvider {
  readonly name = 'brave';

  constructor(private readonly apiKey: string) {}

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async search(query: WebSearchQuery): Promise<WebSearchResult[]> {
    if (!this.apiKey) {
      throw new WebSearchUnavailableError(
        'WEB_SEARCH_BRAVE_API_KEY não configurada.',
      );
    }

    const endpoint = new URL(BRAVE_ENDPOINT);
    endpoint.searchParams.set('q', query.query);
    endpoint.searchParams.set('count', String(query.maxResults));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), query.timeoutMs);
    let response: Response;
    try {
      response = await fetch(endpoint.toString(), {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': this.apiKey,
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Brave Search respondeu ${response.status}.`);
    }

    const data = (await response.json()) as BraveResponse;
    const items = data.web?.results ?? [];
    return items.slice(0, query.maxResults).map((r) => ({
      title: r.title || r.url || '(sem título)',
      url: r.url || '',
      snippet: r.description || '',
      source: 'brave',
    }));
  }
}
