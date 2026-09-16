/** Resolved once per sync run from the `ProviderConnection`, then threaded through every row-mapping call. */
export interface QuickbooksMapContext {
  organizationId: string;
  sourceConnectionId: string;
}
