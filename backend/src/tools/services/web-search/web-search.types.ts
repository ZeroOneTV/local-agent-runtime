export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

export interface WebSearchQuery {
  query: string;
  maxResults: number;
  timeoutMs: number;
}

/**
 * Pluggable search backend. Mirrors the media-worker provider pattern: each
 * backend implements the same contract and reports its own availability, so the
 * operator can swap SearXNG/Brave/etc. via config without touching the tool.
 */
export interface WebSearchProvider {
  /** Stable id, matches WEB_SEARCH_PROVIDER (e.g. 'searxng', 'brave'). */
  readonly name: string;
  /** Whether this provider is configured and usable right now. */
  isAvailable(): boolean;
  /** Run a search. Should throw on transport/config errors. */
  search(query: WebSearchQuery): Promise<WebSearchResult[]>;
}

/** Thrown by providers when they are selected but not usable. */
export class WebSearchUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebSearchUnavailableError';
  }
}
