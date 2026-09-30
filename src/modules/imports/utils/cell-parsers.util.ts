import {
  MAX_DECIMAL_VALUE,
  MAX_MONEY_VALUE,
} from '../constants/import-limits.constants';
import type { CellError, CellValue } from '../types';

/** Removes C0 control characters and DEL, except tab (9), newline (10) and carriage return (13). */
const stripControlCharacters = (value: string): string =>
  [...value]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (
        code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
      );
    })
    .join('');

export type ParseOutcome<T> =
  { ok: true; value: T | null } | { ok: false; message: string };

const ok = <T>(value: T | null): ParseOutcome<T> => ({ ok: true, value });
const fail = <T>(message: string): ParseOutcome<T> => ({ ok: false, message });

export const isCellError = (value: CellValue): value is CellError =>
  typeof value === 'object' && value !== null && 'excelError' in value;

/** Blank means: null, empty/whitespace string. `0` and `false` are values, not blanks. */
export const isBlankCell = (value: CellValue): boolean =>
  value === null || (typeof value === 'string' && value.trim() === '');

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** `Jan`, `jan.`, `Sept`, `September` → 1–12; anything else → null. */
function monthFromName(name: string): number | null {
  const word = name.toLowerCase().replace('.', '');
  if (word.length < 3) return null;
  const index = MONTH_NAMES.findIndex((month) => month.startsWith(word));
  return index >= 0 ? index + 1 : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function toIsoDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects impossible days such as 2026-02-30 (which Date rolls over).
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${pad(month)}-${pad(day)}`
    : null;
}

const DATE_HINT = 'Use YYYY-MM-DD, e.g. 2026-01-31.';

/**
 * Accepts: real Excel date cells, Excel serial numbers, `YYYY-MM-DD`
 * (or `/` `.` separators, optional time), `31 Jan 2026`, `Jan 31, 2026`.
 * Rejects `01/02/2026`-style dates on purpose: they read as 1 Feb or 2 Jan
 * depending on the spreadsheet's locale, and guessing wrong would silently
 * move spend into the wrong month.
 */
export function parseDate(raw: CellValue): ParseOutcome<string> {
  if (isBlankCell(raw)) return ok(null);
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime())
      ? fail(`Not a valid date. ${DATE_HINT}`)
      : ok(raw.toISOString().slice(0, 10));
  }
  if (typeof raw === 'number') {
    // Excel serial date (days since 1899-12-30) in a cell not formatted as a date.
    if (!Number.isInteger(raw) || raw < 1 || raw > 73050) {
      return fail(`${raw} is not a date. ${DATE_HINT}`);
    }
    const date = new Date(Date.UTC(1899, 11, 30) + raw * 86_400_000);
    return ok(date.toISOString().slice(0, 10));
  }
  if (typeof raw !== 'string') return fail(`Not a valid date. ${DATE_HINT}`);

  const text = raw
    .trim()
    .split(/[T ]\d{1,2}:\d{2}/)[0]
    .trim();
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (match) {
    const iso = toIsoDate(+match[1], +match[2], +match[3]);
    return iso ? ok(iso) : fail(`"${raw}" is not a real calendar date.`);
  }
  match = /^(\d{1,2})[\s-]+([A-Za-z]{3,9}\.?)[\s,-]+(\d{4})$/.exec(text);
  const dayFirstMonth = match ? monthFromName(match[2]) : null;
  if (match && dayFirstMonth) {
    const iso = toIsoDate(+match[3], dayFirstMonth, +match[1]);
    return iso ? ok(iso) : fail(`"${raw}" is not a real calendar date.`);
  }
  match = /^([A-Za-z]{3,9}\.?)\s+(\d{1,2}),?\s+(\d{4})$/.exec(text);
  const monthFirstMonth = match ? monthFromName(match[1]) : null;
  if (match && monthFirstMonth) {
    const iso = toIsoDate(+match[3], monthFirstMonth, +match[2]);
    return iso ? ok(iso) : fail(`"${raw}" is not a real calendar date.`);
  }
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(text)) {
    return fail(
      `"${raw}" is ambiguous — it could be day/month or month/day. ${DATE_HINT}`,
    );
  }
  return fail(`"${raw}" is not a recognised date. ${DATE_HINT}`);
}

/**
 * Normalizes a numeric string to plain `-1234.5` form: strips currency
 * symbols/codes and spaces, handles `(12.00)` accounting negatives, and
 * works out whether `,`/`.` is the thousands or decimal separator.
 */
function normalizeNumber(raw: string): string | null {
  let text = raw.trim();
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[^\d.,-]/g, '');
  if (text.startsWith('-') || text.endsWith('-')) {
    negative = !negative;
    text = text.replace(/^-|-$/g, '');
  }
  if (!text || text.includes('-')) return null;

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    const decimal = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    text = text.split(thousands).join('').replace(decimal, '.');
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(text)) text = text.replace(/,/g, '');
    else if (/^\d+,\d{1,2}$/.test(text)) text = text.replace(',', '.');
    else return null;
  } else if (hasDot && /^\d{1,3}(\.\d{3}){2,}$/.test(text)) {
    text = text.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return negative ? `-${text}` : text;
}

function parseScaledNumber(
  raw: CellValue,
  scale: number,
  max: number,
  label: string,
): ParseOutcome<string> {
  if (isBlankCell(raw)) return ok(null);
  let text: string | null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return fail(`Not a valid ${label}.`);
    text = String(Number(raw.toFixed(10)));
  } else if (typeof raw === 'string') {
    text = normalizeNumber(raw);
  } else {
    text = null;
  }
  if (text === null || text.includes('e')) {
    return fail(`"${String(raw as string)}" is not a valid ${label}.`);
  }
  const decimals = text.split('.')[1]?.length ?? 0;
  if (decimals > scale) {
    return fail(`${text} has more than ${scale} decimal places.`);
  }
  const value = Number(text);
  if (Math.abs(value) > max) return fail(`${text} is too large.`);
  return ok(value.toFixed(scale));
}

/** Money: at most 2 decimal places, returned as a fixed 2-dp string. */
export function parseMoney(
  raw: CellValue,
  allowNegative = false,
): ParseOutcome<string> {
  const result = parseScaledNumber(raw, 2, MAX_MONEY_VALUE, 'amount');
  if (result.ok && result.value?.startsWith('-') && !allowNegative) {
    return fail('Must not be negative.');
  }
  return result;
}

/** Quantity / unit price: at most 4 decimal places, never negative. */
export function parseDecimal(raw: CellValue): ParseOutcome<string> {
  const result = parseScaledNumber(raw, 4, MAX_DECIMAL_VALUE, 'number');
  if (result.ok && result.value?.startsWith('-'))
    return fail('Must not be negative.');
  return result;
}

/** `10`, `10%` or `10.5 %` → "10.5000"; must be between 0 and 100. */
export function parsePercent(raw: CellValue): ParseOutcome<string> {
  const text = typeof raw === 'string' ? raw.replace('%', '') : raw;
  const result = parseScaledNumber(text, 4, 100, 'percentage');
  if (result.ok && result.value !== null) {
    const value = Number(result.value);
    if (value < 0 || value > 100) return fail('Must be between 0 and 100.');
  }
  return result;
}

const TRUE_WORDS = ['yes', 'y', 'true', '1', 'active'];
const FALSE_WORDS = ['no', 'n', 'false', '0', 'inactive'];

export function parseBoolean(raw: CellValue): ParseOutcome<boolean> {
  if (typeof raw === 'boolean') return ok(raw);
  const text = parseText(raw);
  if (!text.ok || text.value === null) return text as ParseOutcome<boolean>;
  const word = text.value.toLowerCase();
  if (TRUE_WORDS.includes(word)) return ok(true);
  if (FALSE_WORDS.includes(word)) return ok(false);
  return fail(`"${text.value}" must be Yes or No.`);
}

/** Case/space-insensitive lookup in the column's accepted values. */
export function parseEnum(
  raw: CellValue,
  values: Record<string, string>,
  accepted: string,
): ParseOutcome<string> {
  const text = parseText(raw);
  if (!text.ok || text.value === null) return text;
  const word = text.value.toLowerCase().replace(/\s+/g, ' ');
  return word in values
    ? ok(values[word])
    : fail(`"${text.value}" is not allowed. ${accepted}`);
}

export function parseEmail(raw: CellValue): ParseOutcome<string> {
  const text = parseText(raw);
  if (!text.ok || text.value === null) return text;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.value)
    ? ok(text.value.toLowerCase())
    : fail(`"${text.value}" is not a valid email address.`);
}

export function parseCurrency(raw: CellValue): ParseOutcome<string> {
  const text = parseText(raw);
  if (!text.ok || text.value === null) return text;
  return /^[A-Za-z]{3}$/.test(text.value)
    ? ok(text.value.toUpperCase())
    : fail(`"${text.value}" must be a 3-letter currency code such as USD.`);
}

/** Any cell as trimmed text; numbers keep their plain form (1001, not 1001.0), dates become YYYY-MM-DD. */
export function parseText(raw: CellValue): ParseOutcome<string> {
  if (isBlankCell(raw)) return ok(null);
  if (raw instanceof Date) return ok(raw.toISOString().slice(0, 10));
  if (typeof raw === 'number') return ok(String(Number(raw.toFixed(10))));
  if (typeof raw === 'boolean') return ok(raw ? 'Yes' : 'No');
  if (isCellError(raw))
    return fail(`Cell contains the Excel error ${raw.excelError}.`);
  // Strips invisible control characters (keeping tab/newline) that sneak in
  // from copy-pasting, then trims the ends.
  return ok(stripControlCharacters(String(raw)).trim());
}
