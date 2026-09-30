import { createHash } from 'node:crypto';

/**
 * How a name is compared: Unicode-normalized, trimmed, inner whitespace
 * collapsed, case-insensitive. "ACME  Office supplies " and "Acme Office
 * Supplies" are the same vendor.
 */
export function normalizeName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Deterministic `sourceExternalId` for a CSV-imported record, derived from
 * the names/references that identify it. Re-importing the same row yields
 * the same key, so the canonical upsert updates instead of duplicating.
 * Hashed because the natural key (e.g. a 255-char vendor name plus a
 * reference) can exceed the 100-char `source_external_id` column.
 */
export function recordKey(kind: string, ...parts: string[]): string {
  const digest = createHash('sha256')
    .update(parts.map(normalizeName).join('\u001f'))
    .digest('hex')
    .slice(0, 40);
  return `csv:${kind}:${digest}`;
}

export const vendorKey = (name: string) => recordKey('vendor', name);
export const customerKey = (name: string) => recordKey('customer', name);
export const categoryKey = (name: string) => recordKey('category', name);
export const itemKey = (name: string) => recordKey('item', name);
export const taxRateKey = (name: string) => recordKey('tax_rate', name);
export const expenseKey = (vendor: string, reference: string) =>
  recordKey('expense', vendor, reference);
export const vendorCreditKey = (vendor: string, reference: string) =>
  recordKey('vendor_credit', vendor, reference);
export const billPaymentKey = (vendor: string, reference: string) =>
  recordKey('bill_payment', vendor, reference);
export const saleKey = (reference: string) => recordKey('sale', reference);
export const customerPaymentKey = (customer: string, reference: string) =>
  recordKey('customer_payment', customer, reference);
