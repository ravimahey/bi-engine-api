import type { ColumnSpec, ImportIssue } from '../types';

/** "Rate %", "rate%" and " RATE  % " all match; "Vendor-Name" matches "Vendor Name". */
export const normalizeHeader = (header: string): string =>
  header.toLowerCase().replace(/[^a-z0-9%]/g, '');

export interface HeaderMatch {
  /** Column key → index of that column in the file. */
  columnIndex: Map<string, number>;
  issues: ImportIssue[];
}

/**
 * Maps the file's header row onto a template's columns. Matching ignores
 * case, spaces and punctuation and accepts each column's aliases, so a
 * user's own "Supplier" column works for "Vendor Name". Missing required
 * columns and columns matched twice are errors; unrecognised columns are
 * reported as warnings and ignored.
 */
export function matchHeaders(
  headers: string[],
  columns: ColumnSpec[],
): HeaderMatch {
  const byHeader = new Map<string, ColumnSpec>();
  for (const column of columns) {
    for (const name of [column.header, ...(column.aliases ?? [])]) {
      byHeader.set(normalizeHeader(name), column);
    }
  }

  const columnIndex = new Map<string, number>();
  const issues: ImportIssue[] = [];

  headers.forEach((header, index) => {
    if (!header.trim()) return;
    const column = byHeader.get(normalizeHeader(header));
    if (!column) {
      issues.push({
        severity: 'warning',
        row: null,
        column: header,
        message: `Column "${header}" is not part of this template and was ignored.`,
      });
      return;
    }
    const existing = columnIndex.get(column.key);
    if (existing !== undefined) {
      issues.push({
        severity: 'error',
        row: null,
        column: column.header,
        message: `Columns "${headers[existing]}" and "${header}" both map to "${column.header}". Keep only one.`,
      });
      return;
    }
    columnIndex.set(column.key, index);
  });

  for (const column of columns) {
    if (column.required && !columnIndex.has(column.key)) {
      issues.push({
        severity: 'error',
        row: null,
        column: column.header,
        message: `Required column "${column.header}" is missing. Download the template to see the expected columns.`,
      });
    }
  }

  return { columnIndex, issues };
}
