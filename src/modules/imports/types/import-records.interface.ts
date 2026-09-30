/**
 * Normalized records a validated import stores in `DataImport.payload` and
 * later commits. References to other records are *keys* (the deterministic
 * `sourceExternalId`s from `import-key.util`), never database ids — commit
 * re-resolves them, since rows may have changed in between.
 */

export interface PartyRecord {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
}

export interface CategoryRecord {
  key: string;
  name: string;
  categoryType: string | null;
  parentKey: string | null;
  isActive: boolean;
}

export interface ItemRecord {
  key: string;
  name: string;
  itemType: string;
  description: string | null;
  unitPrice: string | null;
  currency: string;
  isActive: boolean;
}

export interface TaxRateRecord {
  key: string;
  name: string;
  ratePercent: string;
  isActive: boolean;
}

export interface LineRecord {
  lineNumber: number;
  categoryKey: string | null;
  itemKey: string | null;
  taxRateKey: string | null;
  taxRateName: string | null;
  description: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string;
  taxAmount: string;
}

/** Expenses (bill/purchase), vendor credits and sales share this shape. */
export interface TransactionRecord {
  key: string;
  /** ExpenseTransactionType / SalesTransactionType value; unused for vendor credits. */
  type: string | null;
  reference: string;
  partyKey: string;
  partyName: string;
  date: string;
  dueDate: string | null;
  currency: string;
  paymentMethod: string | null;
  notes: string | null;
  total: string;
  lines: LineRecord[];
}

/** Bill payments and customer payments. */
export interface PaymentRecord {
  key: string;
  reference: string;
  partyKey: string;
  partyName: string;
  date: string;
  paymentMethod: string | null;
  currency: string;
  total: string;
  applications: Array<{
    targetKey: string;
    targetReference: string;
    amount: string;
  }>;
}
