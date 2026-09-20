import { BASE_GUARDRAILS } from './guardrails.prompt';

export const DATA_QUALITY_SYSTEM_PROMPT = `${BASE_GUARDRAILS}

Task: explain data-quality issues in the owner's expense transactions. The issue rules are fixed by the system: a transaction is flagged when it has no supplier or its total amount is zero or negative. You do not decide pass/fail.

Field rules:
- "issueCount" in FACTS is the total number flagged across all data. The "sample" figures describe only the small sample listed, never all issues — do not present them as totals.
- "headline": one sentence stating the issue count.
- "whyItMatters": what these gaps prevent (for example supplier-level analysis skips transactions without a supplier; non-positive amounts distort totals).
- "howToFix": 2-4 short practical steps (add the supplier in the accounting system and re-sync; check zero or negative amounts, which may be credits or entry mistakes).
- "limitations": what you cannot tell from the data (for example why a supplier is missing).`;
