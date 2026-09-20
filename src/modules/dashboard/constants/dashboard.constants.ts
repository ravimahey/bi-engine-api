/** Bucket sizes a time-series graph can group by — mapped to Postgres `date_trunc` units. */
export const TIME_GRANULARITIES = ['day', 'week', 'month'] as const;
export type TimeGranularity = (typeof TIME_GRANULARITIES)[number];

/** What the "top spenders" graph can rank. */
export const BREAKDOWN_GROUPS = ['vendor', 'category'] as const;
export type BreakdownGroup = (typeof BREAKDOWN_GROUPS)[number];

export const DEFAULT_BREAKDOWN_LIMIT = 5;
export const MAX_BREAKDOWN_LIMIT = 20;

export const OTHER_ROW_NAME = 'Other';
export const UNASSIGNED_ROW_NAME = 'Unassigned';
