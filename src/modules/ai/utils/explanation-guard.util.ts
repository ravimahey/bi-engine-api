const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Words that assert a cause or a saving the BI data can't prove. `avoidable`
 * is only banned for volume-driven increases (business growth isn't a
 * saving); the rest are banned everywhere.
 */
const UNSUPPORTED_CLAIM_PATTERN =
  /overcharg|overpa(?:id|y)|price (?:hike|gouging)|raised (?:its |their )?prices?/i;
const AVOIDABLE_PATTERN = /avoidable/i;

const extractNumbers = (text: string): number[] =>
  (text.match(NUMBER_PATTERN) ?? [])
    .map((token) => parseFloat(token.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));

const collectFactNumbers = (value: unknown, into: Set<number>): void => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const abs = Math.abs(value);
    // Owners read 37.5% as 38% — accept the standard roundings too.
    into.add(abs);
    into.add(Math.round(abs));
    into.add(Math.round(abs * 10) / 10);
    into.add(Math.round(abs * 100) / 100);
  } else if (typeof value === 'string') {
    extractNumbers(value).forEach((n) => into.add(n));
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectFactNumbers(item, into));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectFactNumbers(item, into));
  }
};

/**
 * Numbers in `texts` that don't appear anywhere in `facts` — the
 * "shown numbers match BI exactly" guardrail. An empty result means every
 * cited figure traces back to the deterministic finding.
 */
export function findUngroundedNumbers(
  texts: string[],
  facts: unknown,
): number[] {
  const allowed = new Set<number>();
  collectFactNumbers(facts, allowed);

  return texts
    .flatMap(extractNumbers)
    .filter((n) => !allowed.has(n) && !allowed.has(Math.round(n * 100) / 100));
}

/** True when the text asserts a cause/saving the data can't support. */
export function containsUnsupportedClaim(
  texts: string[],
  driver: string,
): boolean {
  const joined = texts.join(' ');
  return (
    UNSUPPORTED_CLAIM_PATTERN.test(joined) ||
    (driver === 'volume' && AVOIDABLE_PATTERN.test(joined))
  );
}

const SAVING_PROMISE_PATTERN =
  /guaranteed? sav|you (?:will|would|could) save|will save you/i;
const CONFIRMED_DUPLICATE_PATTERN =
  /\b(?:definitely|certainly|are duplicates|is a duplicate|confirmed duplicate|duplicate confirmed)\b/i;

/** Cause and saving assertions with no driver context (summaries, quality, ask). */
export function containsUnsupportedSavingClaim(texts: string[]): boolean {
  const joined = texts.join(' ');
  return (
    UNSUPPORTED_CLAIM_PATTERN.test(joined) ||
    SAVING_PROMISE_PATTERN.test(joined)
  );
}

/** Duplicates are only ever "possible" — supplier + date + amount can be a genuine repeat. */
export function containsConfirmedDuplicateClaim(texts: string[]): boolean {
  const joined = texts.join(' ');
  return (
    CONFIRMED_DUPLICATE_PATTERN.test(joined) ||
    SAVING_PROMISE_PATTERN.test(joined)
  );
}
