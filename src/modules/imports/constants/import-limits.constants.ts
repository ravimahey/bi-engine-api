/** Largest file accepted, before parsing. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/** Most data rows one file may hold — keeps validate + commit inside one request. */
export const MAX_IMPORT_ROWS = 5000;

/**
 * An .xlsx is a zip; a tiny file can expand to gigabytes ("zip bomb"). The
 * declared uncompressed size of all entries is checked against this before
 * the workbook is parsed.
 */
export const MAX_XLSX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;

/** File extensions accepted. Legacy .xls is rejected with a "save as .xlsx" hint. */
export const IMPORT_FILE_EXTENSIONS = ['.csv', '.xlsx'] as const;

/** Issues stored per import / returned per response; totals are always exact. */
export const MAX_STORED_ISSUES = 1000;
export const MAX_RETURNED_ISSUES = 500;

/** Records shown in the preview table. */
export const IMPORT_PREVIEW_ROWS = 20;

/** How long a validated import can wait to be confirmed before it must be re-uploaded. */
export const IMPORT_VALIDATION_TTL_MS = 24 * 60 * 60 * 1000;

/** Currency used when a row has none and the organization has no company profile. */
export const IMPORT_FALLBACK_CURRENCY = 'USD';

/** Largest amount the numeric(14,2) columns can hold. */
export const MAX_MONEY_VALUE = 999_999_999_999.99;

/** Largest quantity/unit price the numeric(14,4) columns can hold. */
export const MAX_DECIMAL_VALUE = 9_999_999_999.9999;

/** Tolerance when checking Quantity × Unit Price against Amount, and entered vs computed tax. */
export const AMOUNT_TOLERANCE = 0.01;
