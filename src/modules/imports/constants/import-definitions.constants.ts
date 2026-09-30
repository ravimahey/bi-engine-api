import type { ImportType } from '../entities';
import type { ImportDefinition } from '../types';
import {
  BILL_PAYMENTS_DEFINITION,
  CATEGORIES_DEFINITION,
  CUSTOMER_PAYMENTS_DEFINITION,
  CUSTOMERS_DEFINITION,
  EXPENSES_DEFINITION,
  ITEMS_DEFINITION,
  SALES_DEFINITION,
  TAX_RATES_DEFINITION,
  VENDOR_CREDITS_DEFINITION,
  VENDORS_DEFINITION,
} from './definitions';

/**
 * Every import type in the order users must follow: reference data first
 * (steps 1–5), then transactions that refer to it by name (6–10), since
 * rows naming a vendor/category/item/tax rate that doesn't exist yet are
 * rejected.
 */
export const IMPORT_DEFINITIONS: readonly ImportDefinition[] = [
  VENDORS_DEFINITION,
  CUSTOMERS_DEFINITION,
  CATEGORIES_DEFINITION,
  ITEMS_DEFINITION,
  TAX_RATES_DEFINITION,
  EXPENSES_DEFINITION,
  VENDOR_CREDITS_DEFINITION,
  BILL_PAYMENTS_DEFINITION,
  SALES_DEFINITION,
  CUSTOMER_PAYMENTS_DEFINITION,
];

export const getImportDefinition = (type: ImportType): ImportDefinition => {
  const definition = IMPORT_DEFINITIONS.find((d) => d.type === type);
  if (!definition) throw new Error(`Unknown import type "${type}"`);
  return definition;
};
