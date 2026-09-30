import type { ColumnSpec, ImportIssue, ReadRow } from '../types';
import { normalizeName } from './import-key.util';

/** Groups rows by key, preserving first-seen order of groups and rows. */
export function groupRows(
  rows: ReadRow[],
  keyOf: (row: ReadRow) => string,
): Map<string, ReadRow[]> {
  const groups = new Map<string, ReadRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

const same = (a: string | boolean, b: string | boolean): boolean =>
  typeof a === 'string' && typeof b === 'string'
    ? normalizeName(a) === normalizeName(b)
    : a === b;

/**
 * Collapses a multi-row transaction's transaction-level columns into one
 * value each: the first non-blank value wins, blanks on later rows inherit
 * it, and a later row with a *different* value is an error — two rows of
 * one bill can't disagree on its date. Required ones must appear on at
 * least one row.
 */
export function mergeGroupFields(
  rows: ReadRow[],
  columns: ColumnSpec[],
  issues: ImportIssue[],
  label: string,
): Record<string, string | boolean | null> {
  const merged: Record<string, string | boolean | null> = {};

  for (const column of columns.filter((c) => c.groupLevel)) {
    let first: { value: string | boolean; row: number } | null = null;
    for (const row of rows) {
      const value = row.values[column.key];
      if (value === null || value === undefined) continue;
      if (!first) {
        first = { value, row: row.rowNumber };
      } else if (!same(first.value, value)) {
        issues.push({
          severity: 'error',
          row: row.rowNumber,
          column: column.header,
          value: String(value),
          message: `${column.header} differs from row ${first.row} ("${String(first.value)}") for the same ${label}. Transaction-level values must match on every row.`,
        });
      }
    }
    merged[column.key] = first?.value ?? null;

    // Only flag a missing required value if no row had a parse error in that
    // column — otherwise the user would see two errors for one problem.
    const columnFailed = rows.some((row) => row.hasErrors);
    if (column.required && !first && !columnFailed) {
      issues.push({
        severity: 'error',
        row: rows[0].rowNumber,
        column: column.header,
        message: `${column.header} is required for this ${label} (fill it on at least its first row).`,
      });
    }
  }
  return merged;
}
