/**
 * Allowed values for the onboarding profile fields. Mirrors
 * ordara-analytics-frontend's option lists
 * (`src/modules/organizations/constants/onboarding-options.ts`) — the UI
 * sends these `value`s verbatim, so a value added there must be added here.
 */
export const BUSINESS_TYPES = [
  'restaurant',
  'cafe',
  'hotel',
  'caterer',
  'food-wholesaler',
  'distributor',
  'hospitality-group',
  'other',
] as const;

export const LOCATION_COUNTS = ['1', '2-5', '6-20', '20+'] as const;

export const MONTHLY_VOLUMES = [
  'under-50k',
  '50k-250k',
  '250k-1m',
  'over-1m',
] as const;

export const BUSINESS_GOALS = [
  'reduce-costs',
  'track-prices',
  'margins',
  'reporting',
  'forecasting',
] as const;

/**
 * Data sources picked during onboarding — intent only. Actual connections
 * live in `ProviderConnection` (modules/providers) once the user links one.
 */
export const ONBOARDING_INTEGRATIONS = ['xero', 'quickbooks', 'csv'] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];
export type LocationCount = (typeof LOCATION_COUNTS)[number];
export type MonthlyVolume = (typeof MONTHLY_VOLUMES)[number];
export type BusinessGoal = (typeof BUSINESS_GOALS)[number];
export type OnboardingIntegration = (typeof ONBOARDING_INTEGRATIONS)[number];

/** Used when a name slugifies to nothing (e.g. only punctuation). */
export const FALLBACK_SLUG = 'organization';
