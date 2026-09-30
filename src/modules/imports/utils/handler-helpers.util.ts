import type { ImportIssue, ImportSummary, ReadRow } from '../types';
import { normalizeName } from './import-key.util';
import { text } from './row-reader.util';

/**
 * Master-data files must list each name once — two "Acme" rows would
 * silently overwrite each other. Every repeat is an error pointing back at
 * the first occurrence.
 */
export function flagDuplicateNames(
  rows: ReadRow[],
  header: string,
  issues: ImportIssue[],
): void {
  const firstRow = new Map<string, number>();
  for (const row of rows) {
    const name = text(row, 'name');
    if (!name) continue;
    const normalized = normalizeName(name);
    const first = firstRow.get(normalized);
    if (first === undefined) {
      firstRow.set(normalized, row.rowNumber);
    } else {
      issues.push({
        severity: 'error',
        row: row.rowNumber,
        column: header,
        value: name,
        message: `"${name}" is listed twice (also on row ${first}). Each name must appear only once — names are matched ignoring case and extra spaces.`,
      });
    }
  }
}

/** New vs updated counts, from which keys already exist. */
export function summarize(
  keys: string[],
  existing: Map<string, string>,
  extra: Partial<ImportSummary> = {},
): ImportSummary {
  const updated = keys.filter((key) => existing.has(key)).length;
  return {
    records: keys.length,
    newRecords: keys.length - updated,
    updatedRecords: updated,
    ...extra,
  };
}

/** `null`/`undefined` → "", booleans → Yes/No — for the preview table. */
export const cell = (
  value: string | number | boolean | null | undefined,
): string =>
  value === null || value === undefined
    ? ''
    : typeof value === 'boolean'
      ? value
        ? 'Yes'
        : 'No'
      : String(value);
