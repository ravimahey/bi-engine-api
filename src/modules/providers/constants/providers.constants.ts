import { ProviderType } from '../entities';

/** Display names for user-facing text about a connection (e.g. its sync-error signal). */
export const PROVIDER_DISPLAY_NAMES: Record<ProviderType, string> = {
  [ProviderType.QUICKBOOKS]: 'QuickBooks',
  [ProviderType.XERO]: 'Xero',
  [ProviderType.ZOHO]: 'Zoho Books',
};
