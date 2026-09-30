/** "12.34" → 1234. Callers only pass strings already validated as ≤ 2 dp. */
export const toCents = (amount: string): number =>
  Math.round(Number(amount) * 100);

/** 1234 → "12.34"; -50 → "-0.50". */
export const fromCents = (cents: number): string => (cents / 100).toFixed(2);
