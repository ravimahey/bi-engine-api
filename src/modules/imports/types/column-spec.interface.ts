export type ColumnType =
  | 'text'
  | 'money'
  | 'decimal'
  | 'percent'
  | 'date'
  | 'boolean'
  | 'enum'
  | 'email'
  | 'currency';

/**
 * One column of an import template. Drives header matching, cell parsing,
 * the in-app format guide, and the downloadable template — so all four can
 * never disagree.
 */
export interface ColumnSpec {
  /** Key the parsed value is stored under. */
  key: string;
  /** Header exactly as printed in the template. */
  header: string;
  /** Other header spellings accepted (matched case/space/punctuation-insensitively). */
  aliases?: string[];
  type: ColumnType;
  required: boolean;
  maxLength?: number;
  /** For `enum`: accepted input (lowercase) → stored value. */
  enumValues?: Record<string, string>;
  /** For `money`: whether negatives are allowed (e.g. discount lines). */
  allowNegative?: boolean;
  /**
   * Transaction-level field on a multi-row transaction: may be left blank
   * on its continuation rows, and must match wherever it is repeated.
   * Required-ness is then checked once per transaction, not per row.
   */
  groupLevel?: boolean;
  description: string;
}
