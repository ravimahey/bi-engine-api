/**
 * Per-country address/identity rules for an organization's profile.
 * Mirrors ordara-analytics-frontend's `COUNTRIES`
 * (`src/modules/organizations/constants/countries.ts`) — keep the two in
 * step when adding a country, or the API will reject values the UI offers.
 */
export interface CountryRule {
  /** Fixed region codes; when absent, any non-empty region text is accepted. */
  regions?: readonly string[];
  timezones: readonly string[];
  postcode: RegExp;
  postcodeExample: string;
  /** Format check for the business number; absent = free text. */
  businessNumber?: RegExp;
  businessNumberMessage?: string;
}

export const COUNTRY_RULES = {
  AU: {
    regions: ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'],
    timezones: [
      'Australia/Sydney',
      'Australia/Brisbane',
      'Australia/Adelaide',
      'Australia/Darwin',
      'Australia/Hobart',
      'Australia/Perth',
    ],
    postcode: /^\d{4}$/,
    postcodeExample: '3000',
    // ABN (11 digits) or ACN (9 digits); spaces are stripped before matching.
    businessNumber: /^(\d{9}|\d{11})$/,
    businessNumberMessage: 'must be a valid 11-digit ABN or 9-digit ACN',
  },
  NZ: {
    timezones: ['Pacific/Auckland', 'Pacific/Chatham'],
    postcode: /^\d{4}$/,
    postcodeExample: '1010',
  },
  GB: {
    timezones: ['Europe/London'],
    postcode: /^[A-Za-z0-9 ]{5,8}$/,
    postcodeExample: 'SW1A 1AA',
  },
  US: {
    timezones: [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Anchorage',
      'Pacific/Honolulu',
    ],
    postcode: /^\d{5}(-\d{4})?$/,
    postcodeExample: '10001',
  },
  IN: {
    timezones: ['Asia/Kolkata'],
    postcode: /^\d{6}$/,
    postcodeExample: '110001',
  },
  SG: {
    timezones: ['Asia/Singapore'],
    postcode: /^\d{6}$/,
    postcodeExample: '018956',
  },
} as const satisfies Record<string, CountryRule>;

export type CountryCode = keyof typeof COUNTRY_RULES;

export const COUNTRY_CODES = Object.keys(COUNTRY_RULES) as CountryCode[];

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === 'string' && value in COUNTRY_RULES;
}
