import type {
  CellValue,
  ColumnSpec,
  ImportIssue,
  ParsedSheet,
  ReadRow,
} from '../types';
import {
  isBlankCell,
  isCellError,
  parseBoolean,
  parseCurrency,
  parseDate,
  parseDecimal,
  parseEmail,
  parseEnum,
  parseMoney,
  parsePercent,
  parseText,
  type ParseOutcome,
} from './cell-parsers.util';

function parseCell(
  column: ColumnSpec,
  raw: CellValue,
): ParseOutcome<string | boolean> {
  switch (column.type) {
    case 'money':
      return parseMoney(raw, column.allowNegative);
    case 'decimal':
      return parseDecimal(raw);
    case 'percent':
      return parsePercent(raw);
    case 'date':
      return parseDate(raw);
    case 'boolean':
      return parseBoolean(raw);
    case 'enum':
      return parseEnum(raw, column.enumValues ?? {}, column.description);
    case 'email':
      return parseEmail(raw);
    case 'currency':
      return parseCurrency(raw);
    case 'text':
      return parseText(raw);
  }
}

/** A cell as the user typed it, for echoing back in an error message. */
export function displayCell(raw: CellValue): string {
  if (raw === null) return '';
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (isCellError(raw)) return raw.excelError;
  return String(raw).slice(0, 100);
}

/**
 * Parses every data row per the template's column types. Rows whose
 * template cells are all blank are skipped (they're usually spacer rows).
 * Per-row required checks apply only to row-level columns; transaction-level
 * (`groupLevel`) columns are checked once per transaction by the handler.
 */
export function readRows(
  sheet: ParsedSheet,
  columns: ColumnSpec[],
  columnIndex: Map<string, number>,
): { rows: ReadRow[]; issues: ImportIssue[] } {
  const rows: ReadRow[] = [];
  const issues: ImportIssue[] = [];

  for (const sheetRow of sheet.rows) {
    const cellFor = (column: ColumnSpec): CellValue => {
      const index = columnIndex.get(column.key);
      return index === undefined ? null : (sheetRow.cells[index] ?? null);
    };
    if (columns.every((column) => isBlankCell(cellFor(column)))) continue;

    const row: ReadRow = {
      rowNumber: sheetRow.rowNumber,
      values: {},
      hasErrors: false,
    };
    const report = (column: ColumnSpec, raw: CellValue, message: string) => {
      row.hasErrors = true;
      issues.push({
        severity: 'error',
        row: sheetRow.rowNumber,
        column: column.header,
        value: displayCell(raw),
        message,
      });
    };

    for (const column of columns) {
      const raw = cellFor(column);
      row.values[column.key] = null;

      if (isCellError(raw)) {
        report(
          column,
          raw,
          `Cell contains the Excel error ${raw.excelError}. Fix the formula or type the value.`,
        );
        continue;
      }
      const outcome = parseCell(column, raw);
      if (!outcome.ok) {
        report(column, raw, outcome.message);
        continue;
      }
      const value = outcome.value;
      if (
        typeof value === 'string' &&
        column.maxLength &&
        value.length > column.maxLength
      ) {
        report(
          column,
          raw,
          `Too long — at most ${column.maxLength} characters.`,
        );
        continue;
      }
      if (
        column.required &&
        !column.groupLevel &&
        (value === null || value === '')
      ) {
        report(column, raw, `${column.header} is required.`);
        continue;
      }
      row.values[column.key] = value === '' ? null : value;
    }
    rows.push(row);
  }

  return { rows, issues };
}

/** Typed accessors for a parsed row's values. */
export const text = (row: ReadRow, key: string): string | null => {
  const value = row.values[key];
  return typeof value === 'string' ? value : null;
};

export const flag = (row: ReadRow, key: string): boolean | null => {
  const value = row.values[key];
  return typeof value === 'boolean' ? value : null;
};
