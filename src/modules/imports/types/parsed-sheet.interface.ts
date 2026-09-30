/** An Excel error value such as `#N/A` or `#REF!`, kept distinct from text. */
export interface CellError {
  excelError: string;
}

export type CellValue = string | number | boolean | Date | CellError | null;

/** One data row, with the spreadsheet row number the user sees. */
export interface SheetRow {
  rowNumber: number;
  cells: CellValue[];
}

/** A file reduced to a header row plus data rows, whatever its format. */
export interface ParsedSheet {
  headers: string[];
  /** Spreadsheet row number of the header row. */
  headerRowNumber: number;
  rows: SheetRow[];
  /** Non-fatal notes about the file itself (e.g. extra worksheets ignored). */
  warnings: string[];
}

/** A data row after its cells were parsed per `ColumnSpec`: key → value (null when blank or invalid). */
export interface ReadRow {
  rowNumber: number;
  values: Record<string, string | boolean | null>;
  /** Whether any cell on this row failed to parse. */
  hasErrors: boolean;
}
