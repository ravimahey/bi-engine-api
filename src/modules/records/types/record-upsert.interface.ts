import type {
  ExpenseTransactionType,
  ItemType,
  SalesTransactionType,
  SourceSystem,
} from '../entities';

/** Fields every canonical upsert shares — provenance identity used to match an existing row. */
interface ProvenancedUpsertInput {
  organizationId: string;
  sourceSystem: SourceSystem;
  sourceExternalId: string;
  sourceConnectionId: string | null;
}

export interface UpsertCompanyProfileInput extends ProvenancedUpsertInput {
  companyName: string;
  legalName: string | null;
  country: string | null;
  fiscalYearStartMonth: string | null;
  baseCurrency: string | null;
}

export interface UpsertVendorInput extends ProvenancedUpsertInput {
  displayName: string;
  isActive: boolean;
  balance: string | null;
  email: string | null;
  phone: string | null;
}

export interface UpsertSpendCategoryInput extends ProvenancedUpsertInput {
  name: string;
  fullyQualifiedName: string | null;
  categoryType: string | null;
  parentCategoryId: string | null;
  isActive: boolean;
}

export interface UpsertItemInput extends ProvenancedUpsertInput {
  name: string;
  description: string | null;
  itemType: ItemType;
  unitPrice: string | null;
  currency: string;
  isActive: boolean;
}

export interface UpsertTaxRateInput extends ProvenancedUpsertInput {
  name: string;
  ratePercent: string;
  isActive: boolean;
}

export interface UpsertTaxCodeInput extends ProvenancedUpsertInput {
  name: string;
  description: string | null;
  taxable: boolean;
  taxGroup: boolean;
  isActive: boolean;
  primaryPurchaseTaxRateId: string | null;
  primarySalesTaxRateId: string | null;
}

export interface UpsertExpenseTransactionLineInput {
  externalLineId: string;
  // vendorId is intentionally absent: it's always denormalized from the
  // parent ExpenseTransaction's own vendorId by RecordsService, never
  // per-line data (QuickBooks lines don't carry a vendor of their own).
  categoryId: string | null;
  itemId: string | null;
  taxRateId: string | null;
  taxCodeExternalRef: string | null;
  description: string | null;
  lineNumber: number | null;
  amount: string;
  quantity: string | null;
  unitPrice: string | null;
  currency: string;
}

export interface UpsertExpenseTransactionInput extends ProvenancedUpsertInput {
  transactionType: ExpenseTransactionType;
  vendorId: string | null;
  transactionDate: string;
  dueDate: string | null;
  totalAmount: string;
  currency: string;
  balance: string | null;
  paymentMethod: string | null;
  privateNote: string | null;
  lines: UpsertExpenseTransactionLineInput[];
}

export interface UpsertVendorCreditInput extends ProvenancedUpsertInput {
  vendorId: string | null;
  transactionDate: string;
  totalAmount: string;
  currency: string;
  lines: unknown[] | null;
}

export interface UpsertTransactionPaymentInput extends ProvenancedUpsertInput {
  vendorId: string | null;
  paymentDate: string;
  totalAmount: string;
  currency: string;
  paymentMethod: string | null;
  appliedTransactions: unknown[] | null;
}

export interface UpsertCustomerInput extends ProvenancedUpsertInput {
  displayName: string;
  isActive: boolean;
  balance: string | null;
  email: string | null;
  phone: string | null;
}

export interface UpsertSalesTransactionLineInput {
  externalLineId: string;
  // customerId is intentionally absent: it's always denormalized from the
  // parent SalesTransaction's own customerId by RecordsService, never
  // per-line data.
  categoryId: string | null;
  itemId: string | null;
  taxRateId: string | null;
  taxCodeExternalRef: string | null;
  description: string | null;
  lineNumber: number | null;
  amount: string;
  quantity: string | null;
  unitPrice: string | null;
  currency: string;
}

export interface UpsertSalesTransactionInput extends ProvenancedUpsertInput {
  transactionType: SalesTransactionType;
  customerId: string | null;
  transactionDate: string;
  dueDate: string | null;
  totalAmount: string;
  currency: string;
  balance: string | null;
  privateNote: string | null;
  lines: UpsertSalesTransactionLineInput[];
}

export interface UpsertCustomerPaymentInput extends ProvenancedUpsertInput {
  customerId: string | null;
  paymentDate: string;
  totalAmount: string;
  currency: string;
  appliedTransactions: unknown[] | null;
}
