import { extname } from 'node:path';
import { Injectable } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { MAX_IMPORT_ROWS, MAX_XLSX_UNCOMPRESSED_BYTES } from '../constants';
import type { CellValue, ParsedSheet, SheetRow } from '../types';
import {
  declaredUncompressedSize,
  decodeCsv,
  detectCsvLayout,
  isBlankCell,
  isZip,
} from '../utils';

/** A file-level problem the user can fix — surfaced as the import's only error. */
export class ImportFileError extends Error {}

/**
 * Turns an uploaded .csv or .xlsx into one header row plus data rows, with
 * spreadsheet row numbers the user will recognise. Knows nothing about
 * templates — header matching and cell parsing happen afterwards.
 */
@Injectable()
export class ImportFileParserService {
  async parse(fileName: string, buffer: Buffer): Promise<ParsedSheet> {
    if (buffer.length === 0) throw new ImportFileError('The file is empty.');

    const extension = extname(fileName).toLowerCase();
    if (extension === '.xls') {
      throw new ImportFileError(
        'Old Excel 97–2003 (.xls) files are not supported. Open it in Excel and use File → Save As → Excel Workbook (.xlsx) or CSV.',
      );
    }
    if (extension === '.xlsx') return this.parseXlsx(buffer);
    if (extension === '.csv') return this.parseCsv(buffer);
    throw new ImportFileError(
      `"${extension || fileName}" files are not supported. Upload a .csv or .xlsx file.`,
    );
  }

  private parseCsv(buffer: Buffer): ParsedSheet {
    if (isZip(buffer) || buffer.subarray(0, 4096).includes(0)) {
      throw new ImportFileError(
        'This file has a .csv name but is not a text CSV (it may be an Excel file renamed). Save it as CSV from Excel, or upload the .xlsx.',
      );
    }
    const { delimiter, text } = detectCsvLayout(decodeCsv(buffer));

    let records: string[][];
    try {
      records = parseCsv(text, {
        delimiter,
        relax_column_count: true,
        relax_quotes: true,
        skip_empty_lines: false,
        trim: false,
      });
    } catch (error) {
      throw new ImportFileError(
        `The CSV could not be read: ${(error as Error).message}. Check for an unclosed quote (").`,
      );
    }

    return this.toSheet(
      records.map((cells, index) => ({
        rowNumber: index + 1,
        cells: cells.map((cell) => (cell === '' ? null : cell)),
      })),
      [],
    );
  }

  private async parseXlsx(buffer: Buffer): Promise<ParsedSheet> {
    if (!isZip(buffer)) {
      throw new ImportFileError(
        'This file is not a valid .xlsx workbook. If it is password-protected, remove the password in Excel and save it again.',
      );
    }
    const uncompressed = declaredUncompressedSize(buffer);
    if (uncompressed === null || uncompressed > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new ImportFileError(
        'This workbook is too large or malformed to import. Keep one sheet with just the template columns, or save it as CSV.',
      );
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new ImportFileError(
        'The workbook could not be opened — it may be corrupted. Re-save it in Excel or export it as CSV.',
      );
    }

    const sheets = workbook.worksheets.filter(
      (sheet) => sheet.state === 'visible' && sheet.actualRowCount > 0,
    );
    const [sheet] = sheets;
    if (!sheet) throw new ImportFileError('The workbook has no data.');

    const warnings =
      sheets.length > 1
        ? [
            `Only the first sheet "${sheet.name}" was read; ${sheets.length - 1} other sheet(s) were ignored.`,
          ]
        : [];

    const rows: SheetRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: CellValue[] = [];
      for (let column = 1; column <= sheet.columnCount; column += 1) {
        cells.push(this.cellValue(row.getCell(column)));
      }
      rows.push({ rowNumber, cells });
    });
    return this.toSheet(rows, warnings);
  }

  /** Reduces ExcelJS's many cell shapes (formula, rich text, hyperlink, error) to one primitive. */
  private cellValue(cell: ExcelJS.Cell): CellValue {
    const value = cell.value;
    if (value === null || value === undefined) return null;
    if (value instanceof Date || typeof value !== 'object') {
      // A number formatted as a percentage is stored as a fraction (0.1 for 10%).
      if (typeof value === 'number' && /%/.test(cell.numFmt ?? '')) {
        return `${Number((value * 100).toFixed(8))}%`;
      }
      return value;
    }
    if ('error' in value) return { excelError: String(value.error) };
    if ('richText' in value)
      return value.richText.map((part) => part.text).join('');
    if ('formula' in value || 'sharedFormula' in value) {
      const result = (value as { result?: unknown }).result;
      if (result === undefined || result === null) {
        return {
          excelError:
            'a formula with no saved result (open the file in Excel and save it again)',
        };
      }
      if (typeof result === 'object' && result !== null && 'error' in result) {
        return { excelError: String(result.error) };
      }
      return result as CellValue;
    }
    if ('text' in value) {
      const linkText = (value as { text: unknown }).text;
      return typeof linkText === 'string' ? linkText : null;
    }
    return null;
  }

  /** First non-blank row is the header; everything after it is data. */
  private toSheet(rows: SheetRow[], warnings: string[]): ParsedSheet {
    const headerIndex = rows.findIndex((row) =>
      row.cells.some((cell) => !isBlankCell(cell)),
    );
    if (headerIndex < 0) throw new ImportFileError('The file has no data.');

    const header = rows[headerIndex];
    const data = rows
      .slice(headerIndex + 1)
      .filter((row) => row.cells.some((cell) => !isBlankCell(cell)));
    if (data.length === 0) {
      throw new ImportFileError(
        'The file has a header row but no data rows below it.',
      );
    }
    if (data.length > MAX_IMPORT_ROWS) {
      throw new ImportFileError(
        `The file has ${data.length.toLocaleString('en-US')} rows; the limit is ${MAX_IMPORT_ROWS.toLocaleString('en-US')}. Split it into smaller files.`,
      );
    }

    return {
      headers: header.cells.map((cell) =>
        cell === null ? '' : String(cell as string).trim(),
      ),
      headerRowNumber: header.rowNumber,
      rows: data,
      warnings,
    };
  }
}
