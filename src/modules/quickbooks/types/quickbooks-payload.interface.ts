/**
 * Minimal shapes of the actual QuickBooks Accounting API JSON this module
 * reads — enough of each entity's real response (cross-checked against the
 * saved sample payloads in `src/data/*.json`) to map into the raw
 * Quickbooks* tables without guessing field names or falling back to `any`.
 * Every field QuickBooks may omit is optional; nothing here is exhaustive.
 */

export interface QuickbooksRef {
  value?: string;
  name?: string;
}

export interface QuickbooksVendorPayload {
  Id: string;
  SyncToken?: string;
  DisplayName: string;
  Active?: boolean;
  Balance?: number;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
}

export interface QuickbooksAccountPayload {
  Id: string;
  SyncToken?: string;
  Name: string;
  FullyQualifiedName?: string;
  AccountType?: string;
  AccountSubType?: string;
  ParentRef?: QuickbooksRef;
  Active?: boolean;
}

export interface QuickbooksItemPayload {
  Id: string;
  SyncToken?: string;
  Name: string;
  Description?: string;
  Type: string;
  UnitPrice?: number;
  Active?: boolean;
}

export interface QuickbooksTaxRatePayload {
  Id: string;
  SyncToken?: string;
  Name: string;
  RateValue: number;
  AgencyRef?: QuickbooksRef;
}

/** One entry of TaxCode's `SalesTaxRateList`/`PurchaseTaxRateList.TaxRateDetail`. */
export interface QuickbooksTaxRateDetailPayload {
  TaxRateRef?: QuickbooksRef;
  TaxTypeApplicable?: string;
  TaxOrder?: number;
}

export interface QuickbooksTaxCodePayload {
  Id: string;
  SyncToken?: string;
  Name: string;
  Description?: string;
  Taxable?: boolean;
  TaxGroup?: boolean;
  Active?: boolean;
  SalesTaxRateList?: { TaxRateDetail?: QuickbooksTaxRateDetailPayload[] };
  PurchaseTaxRateList?: { TaxRateDetail?: QuickbooksTaxRateDetailPayload[] };
}

/** Step 0 — `/companyinfo/{realmId}`. Confirms the connection and exposes fiscal year/currency. */
export interface QuickbooksCompanyInfoPayload {
  Id: string;
  SyncToken?: string;
  CompanyName?: string;
  LegalName?: string;
  Country?: string;
  FiscalYearStartMonth?: string;
  /** Not always present in sandbox responses — a multi-currency company reports it here. */
  CurrencyRef?: QuickbooksRef;
}

/** Actual response envelope `/companyinfo/{realmId}` returns — the payload is nested under `CompanyInfo`, unlike every other entity's flat `QueryResponse[entity]` shape. */
export interface QuickbooksCompanyInfoResponse {
  CompanyInfo?: QuickbooksCompanyInfoPayload;
  time?: string;
}

export interface QuickbooksCustomerPayload {
  Id: string;
  SyncToken?: string;
  DisplayName: string;
  Active?: boolean;
  Balance?: number;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
}

/**
 * One `Line[]` entry shared by Bill/Purchase/VendorCredit (spend side, one
 * of the two `*ExpenseLineDetail` variants) or Invoice/SalesReceipt (revenue
 * side, `SalesItemLineDetail`) — at most one detail variant is ever present.
 */
export interface QuickbooksLinePayload {
  Id?: string;
  LineNum?: number;
  Description?: string;
  Amount?: number;
  DetailType?: string;
  ItemBasedExpenseLineDetail?: {
    ItemRef?: QuickbooksRef;
    UnitPrice?: number;
    Qty?: number;
    TaxCodeRef?: QuickbooksRef;
  };
  AccountBasedExpenseLineDetail?: {
    AccountRef?: QuickbooksRef;
    TaxCodeRef?: QuickbooksRef;
  };
  SalesItemLineDetail?: {
    ItemRef?: QuickbooksRef;
    UnitPrice?: number;
    Qty?: number;
    ItemAccountRef?: QuickbooksRef;
    TaxCodeRef?: QuickbooksRef;
  };
  LinkedTxn?: Array<{ TxnId?: string; TxnType?: string }>;
}

export interface QuickbooksBillPayload {
  Id: string;
  SyncToken?: string;
  VendorRef?: QuickbooksRef;
  TxnDate: string;
  DueDate?: string;
  TotalAmt: number;
  Balance?: number;
  APAccountRef?: QuickbooksRef;
  PrivateNote?: string;
  Line?: QuickbooksLinePayload[];
}

export interface QuickbooksPurchasePayload {
  Id: string;
  SyncToken?: string;
  PaymentType: string;
  EntityRef?: QuickbooksRef;
  AccountRef?: QuickbooksRef;
  Credit?: boolean;
  TxnDate: string;
  TotalAmt: number;
  PrivateNote?: string;
  Line?: QuickbooksLinePayload[];
}

export interface QuickbooksVendorCreditPayload {
  Id: string;
  SyncToken?: string;
  VendorRef?: QuickbooksRef;
  TxnDate: string;
  TotalAmt: number;
  APAccountRef?: QuickbooksRef;
  Line?: QuickbooksLinePayload[];
}

export interface QuickbooksBillPaymentPayload {
  Id: string;
  SyncToken?: string;
  VendorRef?: QuickbooksRef;
  PayType: string;
  TxnDate: string;
  TotalAmt: number;
  Line?: QuickbooksLinePayload[];
}

export interface QuickbooksInvoicePayload {
  Id: string;
  SyncToken?: string;
  CustomerRef?: QuickbooksRef;
  TxnDate: string;
  DueDate?: string;
  TotalAmt: number;
  Balance?: number;
  PrivateNote?: string;
  Line?: QuickbooksLinePayload[];
}

export interface QuickbooksSalesReceiptPayload {
  Id: string;
  SyncToken?: string;
  CustomerRef?: QuickbooksRef;
  TxnDate: string;
  TotalAmt: number;
  PrivateNote?: string;
  Line?: QuickbooksLinePayload[];
}

export interface QuickbooksPaymentPayload {
  Id: string;
  SyncToken?: string;
  CustomerRef?: QuickbooksRef;
  TxnDate: string;
  TotalAmt: number;
  Line?: QuickbooksLinePayload[];
}
