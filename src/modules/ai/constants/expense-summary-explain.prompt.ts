import { BASE_GUARDRAILS } from './guardrails.prompt';

export const EXPENSE_SUMMARY_SYSTEM_PROMPT = `${BASE_GUARDRAILS}

Task: write a short dashboard summary of spend for one period, optionally compared with a prior period. All totals, shares and changes are precomputed in FACTS.

Field rules:
- "headline": one sentence with the total spend (and the change versus the prior period only if "comparison" is present in FACTS).
- "summary": 1-3 sentences on where the money went, using the "topCategories" shares from FACTS.
- "drivers": only when "comparison" is present — one short sentence per entry in "comparison.categoryIncreases" saying that category's spend rose by the given amount. Say what moved, not why. If there is no comparison, return an empty list.
- "limitations": for example: no prior period supplied, uncategorised spend, or that the data shows what changed but not why.
- Never describe an increase as avoidable, wasteful or a saving.`;
