import { Injectable } from '@nestjs/common';
import type {
  ColumnSpec,
  ImportContext,
  ImportIssue,
  LineRecord,
  ReadRow,
  TransactionRecord,
} from '../types';
import {
  categoryKey,
  computeLineAmounts,
  fromCents,
  groupRows,
  itemKey,
  mergeGroupFields,
  normalizeName,
  taxRateKey,
  text,
} from '../utils';
import { ImportLookupService, REFERENCE_KINDS } from './import-lookup.service';
import type { NamedReference, ReferenceKind } from './import-lookup.service';

export interface TransactionBuildOptions {
  columns: ColumnSpec[];
  partyKind: 'vendor' | 'customer';
  /** Row key holding the party name ("vendor" / "customer"). */
  partyColumn: string;
  partyHeader: string;
  /** Sales are keyed by invoice number alone; expenses/credits by party + reference. */
  groupByReferenceOnly: boolean;
  keyOf: (partyName: string, reference: string) => string;
  /** "bill", "credit", "sale" — used in messages. */
  label: string;
  /** Transaction type that may carry a due date ("bill" / "invoice"); others get it dropped with a warning. */
  dueDateType?: string;
}

/**
 * Builds multi-line transactions (expenses, vendor credits, sales) from
 * rows: groups rows into transactions, merges transaction-level fields
 * (rejecting conflicts), checks every named vendor/customer/category/item/
 * tax rate exists (batched, one query per kind), then computes each line's
 * net amount and tax and the transaction total.
 */
@Injectable()
export class ImportTransactionBuilderService {
  constructor(private readonly lookup: ImportLookupService) {}

  async build(
    rows: ReadRow[],
    context: ImportContext,
    options: TransactionBuildOptions,
  ): Promise<{ records: TransactionRecord[]; issues: ImportIssue[] }> {
    const issues: ImportIssue[] = [];
    const groupable = rows.filter(
      (row) =>
        text(row, 'reference') &&
        (options.groupByReferenceOnly || text(row, options.partyColumn)),
    );
    const groups = groupRows(groupable, (row) =>
      options.groupByReferenceOnly
        ? normalizeName(text(row, 'reference') as string)
        : `${normalizeName(text(row, options.partyColumn) as string)}\u001f${normalizeName(text(row, 'reference') as string)}`,
    );

    // Pass 1 — merge transaction-level fields and collect every name referenced.
    const references: Record<ReferenceKind, NamedReference[]> = {
      vendor: [],
      customer: [],
      category: [],
      item: [],
      taxRate: [],
    };
    const merged = [...groups.values()].map((groupRows) => {
      const fields = mergeGroupFields(
        groupRows,
        options.columns,
        issues,
        options.label,
      );
      const first = groupRows[0];
      const partyName = (
        options.groupByReferenceOnly
          ? fields[options.partyColumn]
          : text(first, options.partyColumn)
      ) as string | null;
      if (partyName)
        references[options.partyKind].push({
          name: partyName,
          row: first.rowNumber,
          column: options.partyHeader,
        });
      for (const row of groupRows) {
        for (const [kind, key, header] of [
          ['category', 'category', 'Category'],
          ['item', 'item', 'Item'],
          ['taxRate', 'taxRate', 'Tax Rate'],
        ] as const) {
          const name = text(row, key);
          if (name)
            references[kind].push({ name, row: row.rowNumber, column: header });
        }
      }
      return { groupRows, fields, partyName };
    });

    for (const kind of Object.keys(references) as ReferenceKind[]) {
      if (references[kind].length)
        await this.lookup.resolveNames(
          kind,
          context.organizationId,
          references[kind],
          issues,
        );
    }
    const taxPercents = await this.lookup.taxRatePercents(
      context.organizationId,
      references.taxRate.map((r) => taxRateKey(r.name)),
    );

    // Pass 2 — lines, totals and transaction-level rules.
    const records: TransactionRecord[] = [];
    for (const { groupRows, fields, partyName } of merged) {
      const first = groupRows[0];
      const date = fields.date as string | null;
      if (!partyName || !date) continue;

      const reference = text(first, 'reference') as string;
      const type = (fields.type as string | null) ?? null;
      let dueDate = (fields.dueDate as string | null) ?? null;
      if (dueDate && options.dueDateType && type !== options.dueDateType) {
        issues.push({
          severity: 'warning',
          row: first.rowNumber,
          column: 'Due Date',
          value: dueDate,
          message: `Due Date is only used for a ${options.dueDateType}; it was ignored for this ${options.label}.`,
        });
        dueDate = null;
      } else if (dueDate && dueDate < date) {
        issues.push({
          severity: 'error',
          row: first.rowNumber,
          column: 'Due Date',
          value: dueDate,
          message: `Due Date ${dueDate} is before the Date ${date}.`,
        });
      }

      const lines: LineRecord[] = [];
      let totalCents = 0;
      for (const row of groupRows) {
        const taxName = text(row, 'taxRate');
        const taxKey = taxName ? taxRateKey(taxName) : null;
        const amounts = computeLineAmounts(
          row,
          taxKey ? (taxPercents.get(taxKey) ?? null) : null,
          issues,
        );
        if (!amounts) continue;
        totalCents += amounts.amountCents + amounts.taxCents;
        const category = text(row, 'category');
        const item = text(row, 'item');
        lines.push({
          lineNumber: lines.length + 1,
          categoryKey: category ? categoryKey(category) : null,
          itemKey: item ? itemKey(item) : null,
          taxRateKey: taxKey,
          taxRateName: taxName,
          description: text(row, 'description'),
          quantity: amounts.quantity,
          unitPrice: amounts.unitPrice,
          amount: fromCents(amounts.amountCents),
          taxAmount: fromCents(amounts.taxCents),
        });
      }
      if (lines.length === groupRows.length && totalCents <= 0) {
        issues.push({
          severity: 'error',
          row: first.rowNumber,
          column: 'Amount',
          message: `The ${options.label} "${reference}" totals ${fromCents(totalCents)}; the total (Amount + Tax Amount over its rows) must be greater than zero.`,
        });
      }

      records.push({
        key: options.keyOf(partyName, reference),
        type,
        reference,
        partyKey: REFERENCE_KINDS[options.partyKind].keyOf(partyName),
        partyName,
        date,
        dueDate,
        currency: (fields.currency as string | null) ?? context.defaultCurrency,
        paymentMethod: (fields.paymentMethod as string | null) ?? null,
        notes: (fields.notes as string | null) ?? null,
        total: fromCents(totalCents),
        lines,
      });
    }
    return { records, issues };
  }
}
