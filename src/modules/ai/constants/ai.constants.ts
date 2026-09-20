/**
 * The only fix options the model may suggest — advisory labels, never
 * executed (LANGCHAIN_INTEGRATION_GUIDE.md §3.1). Fixed here, not left to
 * the model, so the UI can map each one to a known owner-decision action.
 */
export const SUGGESTED_OPTIONS = [
  'Negotiate',
  'Compare suppliers',
  'Monitor',
  'Mark expected',
] as const;

export type SuggestedOptionName = (typeof SUGGESTED_OPTIONS)[number];

/** Appended by code to every explanation — never model-written. */
export const EXPLANATION_DISCLAIMER =
  'Savings are not guaranteed. Figures come from your Ordaraa data; this explanation is advisory and no action has been taken.';

/** Per-caller cap on AI routes (each call can cost a Gemini request): 10 per minute. */
export const AI_THROTTLE = { ttl: 60_000, limit: 10 };

/** Duplicate groups sent to the model per request — the rest are returned unexplained. */
export const MAX_EXPLAINED_DUPLICATE_GROUPS = 20;

/** Transactions sampled for a data-quality explanation (never the full table). */
export const DATA_QUALITY_SAMPLE_SIZE = 20;

/** Categories shown/explained in the expense summary. */
export const TOP_CATEGORIES_LIMIT = 5;

/** Biggest category increases handed to the model as "drivers". */
export const TOP_CATEGORY_INCREASES_LIMIT = 3;

/** Ranking rows a single Ask Ordaraa tool call can return. */
export const MAX_TOOL_RESULT_ROWS = 10;

export const UNCATEGORIZED_LABEL = 'Uncategorized';

/** Retries on a transient Gemini failure before falling back to `explanation: null`. */
export const AI_MAX_RETRIES = 1;
