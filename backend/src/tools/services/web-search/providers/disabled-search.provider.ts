import {
  WebSearchProvider,
  WebSearchQuery,
  WebSearchResult,
  WebSearchUnavailableError,
} from '../web-search.types';

/**
 * Default provider used when nothing is configured. Never silently returns
 * empty results — it fails with a clear, operator-facing message so the model
 * (and the user) understand the capability is off, not broken.
 */
export class DisabledSearchProvider implements WebSearchProvider {
  readonly name = 'disabled';

  isAvailable(): boolean {
    return false;
  }

  search(_query: WebSearchQuery): Promise<WebSearchResult[]> {
    throw new WebSearchUnavailableError(
      'Busca na internet está desabilitada. Peça ao operador para definir ' +
        'WEB_SEARCH_ENABLED=true e configurar WEB_SEARCH_PROVIDER (searxng ou brave).',
    );
  }
}
