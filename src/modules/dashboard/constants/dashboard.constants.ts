// `TimeGranularity` now lives in `@common/constants` — domain-agnostic and
// used by 2+ modules (this one and `admin`). Re-exported here so every
// existing `from '../constants'` import in this module keeps working.
export { TIME_GRANULARITIES } from '@common/constants';
export type { TimeGranularity } from '@common/constants';

/** What the "top spenders" graph can rank. */
export const BREAKDOWN_GROUPS = ['vendor', 'category'] as const;
export type BreakdownGroup = (typeof BREAKDOWN_GROUPS)[number];

export const DEFAULT_BREAKDOWN_LIMIT = 5;
export const MAX_BREAKDOWN_LIMIT = 20;

export const OTHER_ROW_NAME = 'Other';
export const UNASSIGNED_ROW_NAME = 'Unassigned';
