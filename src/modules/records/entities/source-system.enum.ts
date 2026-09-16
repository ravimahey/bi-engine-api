/**
 * Where a canonical record's data originated. A superset of `ProviderType`
 * (`modules/providers`) — it adds `MANUAL`/`CSV`, which have no OAuth
 * connection at all, so it's kept as its own enum rather than reusing
 * `ProviderType` directly.
 */
export enum SourceSystem {
  QUICKBOOKS = 'quickbooks',
  XERO = 'xero',
  ZOHO = 'zoho',
  MANUAL = 'manual',
  CSV = 'csv',
}
