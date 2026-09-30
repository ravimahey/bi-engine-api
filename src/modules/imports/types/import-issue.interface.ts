export type ImportIssueSeverity = 'error' | 'warning';

/**
 * One problem found while validating a file. `row` is the spreadsheet row
 * number the user sees (header = row 1), or null for a file-level problem
 * such as a missing column.
 */
export interface ImportIssue {
  severity: ImportIssueSeverity;
  row: number | null;
  column: string | null;
  value?: string;
  message: string;
}
