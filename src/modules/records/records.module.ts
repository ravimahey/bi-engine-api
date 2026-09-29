import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CompanyProfile,
  Customer,
  CustomerPayment,
  ExpenseTransaction,
  ExpenseTransactionLine,
  Item,
  SalesTransaction,
  SalesTransactionLine,
  SpendCategory,
  TaxCode,
  TaxRate,
  TransactionPayment,
  Vendor,
  VendorCredit,
} from './entities';
import { RecordsController } from './records.controller';
import { RecordsMasterDataController } from './records-master-data.controller';
import { RecordsRevenueController } from './records-revenue.controller';
import {
  RecordsFilterService,
  RecordsLookupService,
  RecordsQueryService,
  RecordsRemovalService,
  RecordsRevenueFilterService,
  RecordsRevenueQueryService,
  RecordsRevenueService,
  RecordsRevenueTransactionsQueryService,
  RecordsService,
  RecordsTransactionsQueryService,
} from './services';

/**
 * The canonical layer — provider-agnostic data every other part of the app
 * (dashboard, findings engine, "Ask Ordaraa") reads from. Exports
 * `RecordsService`/`RecordsRevenueService` so a provider module's mapper
 * (see `QuickbooksMasterDataMapperService`, `QuickbooksTransactionMapperService`,
 * `QuickbooksRevenueMapperService`, and the `Xero*MapperService` equivalents)
 * can write into it; this module never
 * imports a provider module back.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyProfile,
      Vendor,
      SpendCategory,
      Item,
      TaxRate,
      TaxCode,
      ExpenseTransaction,
      ExpenseTransactionLine,
      VendorCredit,
      TransactionPayment,
      Customer,
      SalesTransaction,
      SalesTransactionLine,
      CustomerPayment,
    ]),
  ],
  controllers: [
    RecordsController,
    RecordsMasterDataController,
    RecordsRevenueController,
  ],
  providers: [
    RecordsService,
    RecordsRemovalService,
    RecordsRevenueService,
    RecordsFilterService,
    RecordsLookupService,
    RecordsQueryService,
    RecordsRevenueQueryService,
    RecordsTransactionsQueryService,
    RecordsRevenueTransactionsQueryService,
    RecordsRevenueFilterService,
  ],
  exports: [
    RecordsService,
    RecordsRemovalService,
    RecordsRevenueService,
    RecordsFilterService,
    RecordsLookupService,
    RecordsQueryService,
    RecordsRevenueQueryService,
    RecordsTransactionsQueryService,
    RecordsRevenueTransactionsQueryService,
    RecordsRevenueFilterService,
  ],
})
export class RecordsModule {}
