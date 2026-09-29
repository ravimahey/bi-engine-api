import type { XeroLineAmountTypes, XeroLineItemPayload } from '../types';

const round = (value: number, decimals: number): string =>
  value.toFixed(decimals);

/**
 * A line's amount *excluding* tax, as a 2-dp string. When a transaction's
 * `LineAmountTypes` is `Inclusive`, Xero's `LineAmount` already contains the
 * tax, so it's netted out here. Keeping tax out of line amounts is what stops
 * a tax-rate change from looking like a supplier price increase.
 */
export function netLineAmount(
  line: XeroLineItemPayload,
  lineAmountTypes: XeroLineAmountTypes | undefined,
): string {
  const gross = line.LineAmount ?? 0;
  const tax = lineAmountTypes === 'Inclusive' ? (line.TaxAmount ?? 0) : 0;
  return round(gross - tax, 2);
}

/**
 * Tax-exclusive unit price, as a 4-dp string (or `null` if Xero sent none).
 * For `Inclusive` lines it's derived from the net amount so it stays
 * consistent with `netLineAmount`, since Xero's `UnitAmount` is gross there too.
 */
export function netUnitPrice(
  line: XeroLineItemPayload,
  lineAmountTypes: XeroLineAmountTypes | undefined,
): string | null {
  if (line.UnitAmount == null) return null;
  if (lineAmountTypes !== 'Inclusive' || !line.Quantity) {
    return round(line.UnitAmount, 4);
  }
  return round(Number(netLineAmount(line, lineAmountTypes)) / line.Quantity, 4);
}

/** Converts a Xero month number (1–12) to the month *after* it, by name — FY end month → FY start month. */
export function fiscalYearStartMonthName(
  financialYearEndMonth: number | undefined,
): string | null {
  if (
    !financialYearEndMonth ||
    financialYearEndMonth < 1 ||
    financialYearEndMonth > 12
  ) {
    return null;
  }
  const startMonthIndex = financialYearEndMonth % 12; // 0-based month after the end month
  return new Date(Date.UTC(2000, startMonthIndex, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
}
