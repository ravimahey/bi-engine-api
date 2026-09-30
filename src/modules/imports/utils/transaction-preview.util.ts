import { IMPORT_PREVIEW_ROWS } from '../constants/import-limits.constants';
import type { ImportSummary, TransactionRecord } from '../types';
import { fromCents, toCents } from './money.util';

/** Preview rows for multi-line transactions — one row per transaction, not per line. */
export function transactionPreview(
  records: TransactionRecord[],
  existing: Map<string, string>,
  headers: { reference: string; party: string; showType: boolean },
): Array<Record<string, string>> {
  return records.slice(0, IMPORT_PREVIEW_ROWS).map((r) => ({
    [headers.reference]: r.reference,
    ...(headers.showType ? { Type: r.type ?? '' } : {}),
    Date: r.date,
    [headers.party]: r.partyName,
    Lines: String(r.lines.length),
    Total: `${r.total} ${r.currency}`,
    Action: existing.has(r.key) ? 'Replace' : 'Create',
  }));
}

/** Line count, grand total and currencies for the summary. */
export function transactionTotals(
  records: TransactionRecord[],
): Partial<ImportSummary> {
  return {
    lines: records.reduce((sum, r) => sum + r.lines.length, 0),
    totalAmount: fromCents(
      records.reduce((sum, r) => sum + toCents(r.total), 0),
    ),
    currencies: [...new Set(records.map((r) => r.currency))],
  };
}
