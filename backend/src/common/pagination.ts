export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function parsePagination(
  limit?: string | number,
  offset?: string | number,
  defaultLimit = 50,
  maxLimit = 200,
): { limit: number; offset: number } {
  const parsedLimit = Math.min(
    Math.max(1, parseInt(String(limit ?? defaultLimit), 10) || defaultLimit),
    maxLimit,
  );
  const parsedOffset = Math.max(0, parseInt(String(offset ?? 0), 10) || 0);
  return { limit: parsedLimit, offset: parsedOffset };
}

export function toPaginated<T>(
  items: T[],
  total: number,
  limit: number,
  offset: number,
): PaginatedResult<T> {
  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}
