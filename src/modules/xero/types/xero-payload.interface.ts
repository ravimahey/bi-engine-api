/**
 * Minimal shapes of the Xero Accounting API JSON this module reads — enough
 * of each entity's real response to map into the canonical records/* tables
 * without guessing field names or falling back to `any`. Xero fields are
 * PascalCase, every *ID is a GUID string, and dates arrive as
 * `/Date(1712345678000+0000)/` (with an ISO `DateString` twin on most
 * transactions). Every field Xero may omit is optional; nothing here is
 * exhaustive.
 */

/** Step 0 — one entry of `GET https://api.xero.com/connections`. */
export interface XeroTenantConnection {
  id: string;
  authEventId?: string;
  tenantId: string;
  tenantType: string;
  tenantName?: string;
  createdDateUtc?: string;
  updatedDateUtc?: string;
}

/** Step 1 — one entry of `GET /Organisation`'s `Organisations[]`. */
export interface XeroOrganisationPayload {
  OrganisationID: string;
  Name?: string;
  LegalName?: string;
  CountryCode?: string;
  BaseCurrency?: string;
  FinancialYearEndDay?: number;
  FinancialYearEndMonth?: number;
}

export interface XeroContactRef {
  ContactID?: string;
  Name?: string;
}

export interface XeroContactPayload {
  ContactID: string;
  Name?: string;
  ContactStatus?: string;
  IsSupplier?: boolean;
  IsCustomer?: boolean;
  EmailAddress?: string;
  Phones?: Array<{
    PhoneType?: string;
    PhoneNumber?: string;
    PhoneAreaCode?: string;
    PhoneCountryCode?: string;
  }>;
  Balances?: { AccountsPayable?: { Outstanding?: number } };
}

export interface XeroAccountPayload {
  AccountID: string;
  Code?: string;
  Name: string;
  Type?: string;
  Class?: string;
  Status?: string;
}

export interface XeroItemPayload {
  ItemID: string;
  Code: string;
  Name?: string;
  Description?: string;
  PurchaseDescription?: string;
  IsTrackedAsInventory?: boolean;
  PurchaseDetails?: { UnitPrice?: number; AccountCode?: string };
}

export interface XeroTaxRatePayload {
  TaxType: string;
  Name: string;
  Status?: string;
  EffectiveRate?: number | string;
}

/** One `LineItems[]` entry — shared by Invoices, BankTransactions and CreditNotes. */
export interface XeroLineItemPayload {
  LineItemID?: string;
  Description?: string;
  Quantity?: number;
  UnitAmount?: number;
  LineAmount?: number;
  TaxAmount?: number;
  AccountCode?: string;
  AccountID?: string;
  ItemCode?: string;
  Item?: { ItemID?: string; Code?: string; Name?: string };
  TaxType?: string;
}

/** `Exclusive` | `Inclusive` | `NoTax` — whether `LineAmount` already includes `TaxAmount`. */
export type XeroLineAmountTypes = 'Exclusive' | 'Inclusive' | 'NoTax';

export interface XeroInvoicePayload {
  InvoiceID: string;
  Type: string;
  Status?: string;
  InvoiceNumber?: string;
  Reference?: string;
  Contact?: XeroContactRef;
  Date?: string;
  DateString?: string;
  DueDate?: string;
  DueDateString?: string;
  LineAmountTypes?: XeroLineAmountTypes;
  Total?: number;
  AmountDue?: number;
  CurrencyCode?: string;
  LineItems?: XeroLineItemPayload[];
}

export interface XeroBankTransactionPayload {
  BankTransactionID: string;
  Type: string;
  Status?: string;
  Reference?: string;
  Contact?: XeroContactRef;
  BankAccount?: { AccountID?: string; Code?: string; Name?: string };
  Date?: string;
  DateString?: string;
  LineAmountTypes?: XeroLineAmountTypes;
  Total?: number;
  CurrencyCode?: string;
  LineItems?: XeroLineItemPayload[];
}

export interface XeroCreditNotePayload {
  CreditNoteID: string;
  Type: string;
  Status?: string;
  Contact?: XeroContactRef;
  Date?: string;
  DateString?: string;
  LineAmountTypes?: XeroLineAmountTypes;
  Total?: number;
  CurrencyCode?: string;
  LineItems?: XeroLineItemPayload[];
}

export interface XeroPaymentPayload {
  PaymentID: string;
  PaymentType?: string;
  Status?: string;
  Date?: string;
  Amount?: number;
  Reference?: string;
  CurrencyRate?: number;
  Invoice?: {
    InvoiceID?: string;
    Type?: string;
    CurrencyCode?: string;
    Contact?: XeroContactRef;
  };
  Account?: { AccountID?: string; Code?: string };
}

/** Shape of the JSON body Xero returns on a non-2xx Accounting/identity API response — it varies by endpoint. */
export interface XeroErrorBody {
  Title?: string;
  Detail?: string;
  Message?: string;
  error?: string;
  error_description?: string;
}
