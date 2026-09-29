/**
 * Resolved once per sync run, then threaded through every row-mapping call.
 * `baseCurrency` comes from the Organisation step, so a transaction without
 * its own `CurrencyCode` still gets an explicit currency, never an assumed one.
 */
export interface XeroMapContext {
  organizationId: string;
  sourceConnectionId: string;
  baseCurrency: string | null;
}

/**
 * Xero line items point at accounts and items by `AccountCode`/`ItemCode`,
 * while the canonical rows are keyed by `AccountID`/`ItemID`. This index,
 * built from the Accounts/Items fetched during the same run, bridges the two
 * without a raw provider table.
 */
export interface XeroReferenceIndex {
  accountIdByCode: Map<string, string>;
  itemIdByCode: Map<string, string>;
}

/**
 * Mutable state for one poll run. Accounts/Items fetched during the run are
 * kept so the reference index is built from them instead of re-fetched; if
 * the run didn't include them (a webhook pull of Invoices, say), they're
 * fetched once, lazily, the first time a transaction needs the index.
 */
export interface XeroSyncRunState {
  context: XeroMapContext;
  accounts?: Array<{ AccountID: string; Code?: string }>;
  items?: Array<{ ItemID: string; Code: string }>;
  index?: XeroReferenceIndex;
}
