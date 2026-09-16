/**
 * QuickBooks' own pre-aggregated reports this module can cross-check its
 * computed totals against — see the Reports API build-order step. A closed
 * set, not a free-form string, so callers can't request an arbitrary report.
 */
export enum QuickbooksReportName {
  ProfitAndLoss = 'ProfitAndLoss',
  VendorExpenses = 'VendorExpenses',
  PurchasesByVendorDetail = 'PurchasesByVendorDetail',
}
