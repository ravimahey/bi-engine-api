import { Injectable } from '@nestjs/common';
import { ImportType } from '../entities';
import type { ImportHandler } from '../types';
import { BillPaymentsImportService } from './bill-payments-import.service';
import { CategoriesImportService } from './categories-import.service';
import { CustomerPaymentsImportService } from './customer-payments-import.service';
import { CustomersImportService } from './customers-import.service';
import { ExpensesImportService } from './expenses-import.service';
import { ItemsImportService } from './items-import.service';
import { SalesImportService } from './sales-import.service';
import { TaxRatesImportService } from './tax-rates-import.service';
import { VendorCreditsImportService } from './vendor-credits-import.service';
import { VendorsImportService } from './vendors-import.service';

/** Maps each import type to the service holding its business rules. */
@Injectable()
export class ImportRegistryService {
  private readonly handlers: Record<ImportType, ImportHandler>;

  constructor(
    vendors: VendorsImportService,
    customers: CustomersImportService,
    categories: CategoriesImportService,
    items: ItemsImportService,
    taxRates: TaxRatesImportService,
    expenses: ExpensesImportService,
    vendorCredits: VendorCreditsImportService,
    billPayments: BillPaymentsImportService,
    sales: SalesImportService,
    customerPayments: CustomerPaymentsImportService,
  ) {
    this.handlers = {
      [ImportType.VENDORS]: vendors,
      [ImportType.CUSTOMERS]: customers,
      [ImportType.CATEGORIES]: categories,
      [ImportType.ITEMS]: items,
      [ImportType.TAX_RATES]: taxRates,
      [ImportType.EXPENSES]: expenses,
      [ImportType.VENDOR_CREDITS]: vendorCredits,
      [ImportType.BILL_PAYMENTS]: billPayments,
      [ImportType.SALES]: sales,
      [ImportType.CUSTOMER_PAYMENTS]: customerPayments,
    };
  }

  handlerFor(type: ImportType): ImportHandler {
    return this.handlers[type];
  }
}
