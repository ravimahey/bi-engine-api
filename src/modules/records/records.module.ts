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
import {
  RecordsFilterService,
  RecordsLookupService,
  RecordsRevenueService,
  RecordsService,
} from './services';

/**
 * The canonical layer — provider-agnostic data every other part of the app
 * (dashboard, findings engine, "Ask Ordaraa") reads from. Exports
 * `RecordsService`/`RecordsRevenueService` so a provider module's mapper
 * (see `QuickbooksMasterDataMapperService`, `QuickbooksTransactionMapperService`,
 * `QuickbooksRevenueMapperService`) can write into it; this module never
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
  controllers: [RecordsController],
  providers: [
    RecordsService,
    RecordsRevenueService,
    RecordsFilterService,
    RecordsLookupService,
  ],
  exports: [
    RecordsService,
    RecordsRevenueService,
    RecordsFilterService,
    RecordsLookupService,
  ],
})
export class RecordsModule {}
