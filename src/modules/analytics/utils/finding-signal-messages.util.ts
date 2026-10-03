import type {
  CategoryPriceIncrease,
  DuplicateGroupWithCurrency,
} from '../types';

/**
 * Signal wording for BI findings: fixed templates filled with numbers the
 * detectors already computed. Facts first, wording second — no model is
 * involved, and nothing here calculates.
 */

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.trim(),
    }).format(amount);
  } catch {
    // An unrecognised currency code must not cost the user the signal.
    return amount.toFixed(2);
  }
}

/** `37.5` / `40` — one decimal, without a trailing `.0`. */
const formatPercent = (value: number): string =>
  String(Math.round(value * 10) / 10);

export const costIncreaseTitle = (finding: CategoryPriceIncrease): string =>
  `${finding.categoryName} costs increased`;

export const costIncreaseMessage = (finding: CategoryPriceIncrease): string =>
  `${finding.categoryName} spend is up ${formatPercent(finding.spendChangePercent)}% with flat volume.`;

export const possibleDuplicateMessage = (
  group: DuplicateGroupWithCurrency,
): string =>
  `Possible duplicate bill from ${group.vendorName ?? 'an unknown supplier'} for ${formatAmount(group.totalAmount, group.currency)}.`;

export const missingSupplierMessage = (count: number): string =>
  count === 1
    ? '1 transaction this month has no supplier assigned.'
    : `${count} transactions this month have no supplier assigned.`;
