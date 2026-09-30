import type {
  ColumnSpec,
  ImportContext,
  ImportIssue,
  PaymentRecord,
  ReadRow,
} from '../types';
import {
  fromCents,
  groupRows,
  mergeGroupFields,
  normalizeName,
  text,
  toCents,
} from '../utils';
import type {
  ImportLookupService,
  ReferenceKind,
} from './import-lookup.service';
import { REFERENCE_KINDS } from './import-lookup.service';

/** An imported bill/invoice a payment row points at, as far as validation needs it. */
export interface PaymentTarget {
  transactionType: string;
  totalAmount: string;
}

export interface PaymentBuildOptions {
  columns: ColumnSpec[];
  partyKind: Extract<ReferenceKind, 'vendor' | 'customer'>;
  partyHeader: string;
  /** Row key holding the referenced bill/invoice number. */
  targetColumn: string;
  targetHeader: string;
  keyOf: (party: string, reference: string) => string;
  targetKeyOf: (party: string, targetReference: string) => string;
  findTargets: (keys: string[]) => Promise<Map<string, PaymentTarget>>;
  /** The only transaction type a payment may be applied to ("bill" / "invoice"). */
  payableType: string;
  targetLabel: string;
  targetStep: string;
}

/**
 * Bill payments and customer payments share one shape: rows grouped into a
 * payment by party + Payment Reference, each row applying an amount to one
 * previously imported bill/invoice. Checks the target exists for that
 * party, is payable (a purchase/sales receipt is already paid), isn't
 * applied twice within one payment, and warns when a payment exceeds the
 * target's total.
 */
export async function buildPayments(
  lookup: ImportLookupService,
  rows: ReadRow[],
  context: ImportContext,
  options: PaymentBuildOptions,
): Promise<{ records: PaymentRecord[]; issues: ImportIssue[] }> {
  const issues: ImportIssue[] = [];
  const partyColumn = options.partyKind;
  const groups = groupRows(
    rows.filter((row) => text(row, 'reference') && text(row, partyColumn)),
    (row) =>
      `${normalizeName(text(row, partyColumn) as string)}\u001f${normalizeName(text(row, 'reference') as string)}`,
  );

  await lookup.resolveNames(
    options.partyKind,
    context.organizationId,
    [...groups.values()].map((g) => ({
      name: text(g[0], partyColumn) as string,
      row: g[0].rowNumber,
      column: options.partyHeader,
    })),
    issues,
  );
  const targetKeyOfRow = (row: ReadRow) =>
    options.targetKeyOf(
      text(row, partyColumn) as string,
      text(row, options.targetColumn) as string,
    );
  const targets = await options.findTargets(
    rows
      .filter(
        (row) => text(row, options.targetColumn) && text(row, partyColumn),
      )
      .map(targetKeyOfRow),
  );

  const records: PaymentRecord[] = [];
  for (const groupRowsOfPayment of groups.values()) {
    const fields = mergeGroupFields(
      groupRowsOfPayment,
      options.columns,
      issues,
      'payment',
    );
    const first = groupRowsOfPayment[0];
    const partyName = text(first, partyColumn) as string;
    const applied = new Map<string, number>();
    const applications: PaymentRecord['applications'] = [];

    for (const row of groupRowsOfPayment) {
      const targetReference = text(row, options.targetColumn);
      const amount = text(row, 'amount');
      if (!targetReference || !amount) continue;
      const targetKey = targetKeyOfRow(row);
      const target = targets.get(targetKey);
      const fail = (message: string) =>
        issues.push({
          severity: 'error',
          row: row.rowNumber,
          column: options.targetHeader,
          value: targetReference,
          message,
        });

      if (!target) {
        fail(
          `${options.targetLabel} "${targetReference}" for ${partyName} was not found. Import it in ${options.targetStep} first, and check that the ${options.partyHeader.toLowerCase()} matches.`,
        );
      } else if (target.transactionType !== options.payableType) {
        fail(
          `"${targetReference}" was imported as a ${target.transactionType.replace('_', ' ')}, which is already paid. Only a ${options.payableType} can receive a payment.`,
        );
      } else if (applied.has(targetKey)) {
        fail(
          `${options.targetLabel} "${targetReference}" appears twice in this payment (also row ${applied.get(targetKey)}). Combine them into one row.`,
        );
      } else if (toCents(amount) === 0) {
        issues.push({
          severity: 'error',
          row: row.rowNumber,
          column: 'Amount',
          value: amount,
          message: 'Amount must be greater than zero.',
        });
      } else {
        if (toCents(amount) > toCents(target.totalAmount)) {
          issues.push({
            severity: 'warning',
            row: row.rowNumber,
            column: 'Amount',
            value: amount,
            message: `Paying ${amount} against ${options.targetLabel.toLowerCase()} "${targetReference}", whose total is ${target.totalAmount}.`,
          });
        }
        applied.set(targetKey, row.rowNumber);
        applications.push({ targetKey, targetReference, amount });
      }
    }

    const date = fields.date as string | null;
    if (!date || applications.length === 0) continue;
    records.push({
      key: options.keyOf(partyName, text(first, 'reference') as string),
      reference: text(first, 'reference') as string,
      partyKey: REFERENCE_KINDS[options.partyKind].keyOf(partyName),
      partyName,
      date,
      paymentMethod: (fields.paymentMethod as string | null) ?? null,
      currency: (fields.currency as string | null) ?? context.defaultCurrency,
      total: fromCents(
        applications.reduce((sum, a) => sum + toCents(a.amount), 0),
      ),
      applications,
    });
  }
  return { records, issues };
}
