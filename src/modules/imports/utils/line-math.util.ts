import { AMOUNT_TOLERANCE } from '../constants/import-limits.constants';
import type { ImportIssue, ReadRow } from '../types';
import { fromCents } from './money.util';
import { text } from './row-reader.util';

export interface LineAmounts {
  amountCents: number;
  taxCents: number;
  quantity: string | null;
  unitPrice: string | null;
}

/**
 * Works out a line's net amount and tax, checking they agree with each
 * other: Amount may be omitted when Quantity × Unit Price gives it; a
 * mismatch between them is a warning (discounts are legitimate) and Amount
 * wins. Tax Amount is calculated from the tax rate when blank, and a
 * mismatch with the rate is a warning. Returns null (with an error) when
 * no amount can be determined.
 */
export function computeLineAmounts(
  row: ReadRow,
  taxPercent: string | null,
  issues: ImportIssue[],
): LineAmounts | null {
  const quantity = text(row, 'quantity');
  const unitPrice = text(row, 'unitPrice');
  const amount = text(row, 'amount');
  const product =
    quantity !== null && unitPrice !== null
      ? Math.round(Number(quantity) * Number(unitPrice) * 100)
      : null;

  let amountCents: number;
  if (amount !== null) {
    amountCents = Math.round(Number(amount) * 100);
    if (
      product !== null &&
      Math.abs(product - amountCents) > AMOUNT_TOLERANCE * 100
    ) {
      issues.push({
        severity: 'warning',
        row: row.rowNumber,
        column: 'Amount',
        value: amount,
        message: `Amount ${amount} differs from Quantity × Unit Price (${quantity} × ${unitPrice} = ${fromCents(product)}). Amount is used.`,
      });
    }
  } else if (product !== null) {
    amountCents = product;
  } else {
    if (!row.hasErrors) {
      issues.push({
        severity: 'error',
        row: row.rowNumber,
        column: 'Amount',
        message: 'Amount is required (or fill both Quantity and Unit Price).',
      });
    }
    return null;
  }

  const taxAmount = text(row, 'taxAmount');
  const computedTax =
    taxPercent !== null
      ? Math.round((amountCents * Number(taxPercent)) / 100)
      : null;
  let taxCents = 0;
  if (taxAmount !== null) {
    taxCents = Math.round(Number(taxAmount) * 100);
    if (
      computedTax !== null &&
      Math.abs(computedTax - taxCents) > AMOUNT_TOLERANCE * 100
    ) {
      issues.push({
        severity: 'warning',
        row: row.rowNumber,
        column: 'Tax Amount',
        value: taxAmount,
        message: `Tax Amount ${taxAmount} doesn't match the tax rate (${Number(taxPercent)}% of ${fromCents(amountCents)} = ${fromCents(computedTax)}). The entered Tax Amount is used.`,
      });
    }
  } else if (computedTax !== null) {
    taxCents = computedTax;
  }

  return { amountCents, taxCents, quantity, unitPrice };
}
