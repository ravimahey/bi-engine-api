import type { QUICKBOOKS_QUERY_ENTITIES } from '../constants';

// QuickBooks entities this service knows how to list. A closed union — not a
// free-form string — so callers can't build an arbitrary `SELECT * FROM`.
export type QuickbooksQueryEntity = (typeof QUICKBOOKS_QUERY_ENTITIES)[number];

export interface QuickbooksQueryResponse<T> {
  QueryResponse?: Partial<Record<QuickbooksQueryEntity, T[]>>;
}
