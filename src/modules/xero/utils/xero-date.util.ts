// Xero's .NET JSON date: `/Date(1712345678000)/` or `/Date(1712345678000+0000)/`.
const DOTNET_DATE_PATTERN = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/;

/**
 * Converts any Xero date field to a `YYYY-MM-DD` calendar date, or `null` if
 * it's missing or unparseable. Accepts the `/Date(ms+zone)/` form Xero uses
 * on most fields and the ISO form of its `DateString` twins
 * (`2026-02-15T00:00:00`). Xero dates are calendar dates in the
 * organisation's own timezone, so the ISO form is sliced, never shifted
 * through `Date` — a UTC conversion could move it to the previous day.
 */
export function parseXeroDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const dotnet = DOTNET_DATE_PATTERN.exec(value);
  if (dotnet) {
    const date = new Date(Number(dotnet[1]));
    return Number.isNaN(date.getTime())
      ? null
      : date.toISOString().slice(0, 10);
  }

  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

/** Same as `parseXeroDate`, preferring the ISO `DateString` twin when Xero sends one. */
export function pickXeroDate(
  dateString: string | undefined,
  date: string | undefined,
): string | null {
  return parseXeroDate(dateString) ?? parseXeroDate(date);
}

/** `YYYY-MM-DD` → the `DateTime(y,m,d)` literal Xero's `where` filter expects. */
export function toXeroWhereDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return `DateTime(${year},${month},${day})`;
}

/**
 * The `If-Modified-Since` value for an incremental pull: the stored cursor
 * minus `overlapMs`, as the UTC `YYYY-MM-DDTHH:mm:ss` form Xero's docs use.
 */
export function toXeroModifiedSince(cursor: string, overlapMs: number): string {
  return new Date(new Date(cursor).getTime() - overlapMs)
    .toISOString()
    .slice(0, 19);
}
