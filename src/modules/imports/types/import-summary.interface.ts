/** Counts shown in the preview before the user confirms, and kept after commit. */
export interface ImportSummary {
  /** Records the file produces (vendors, bills, payments, …). */
  records: number;
  /** Of those, how many don't exist yet and will be created. */
  newRecords: number;
  /** Of those, how many already exist (from an earlier import) and will be updated. */
  updatedRecords: number;
  /** Line items, for transaction imports. */
  lines?: number;
  /** Sum of record totals, for transaction imports, as a 2-dp string. */
  totalAmount?: string;
  /** Currencies seen across the file. */
  currencies?: string[];
}
