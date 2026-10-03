import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsModule } from '@modules/analytics/analytics.module';
import { RecordsModule } from '@modules/records/records.module';
import { DataImport } from './entities';
import { ImportsController } from './imports.controller';
import {
  BillPaymentsImportService,
  CategoriesImportService,
  CustomerPaymentsImportService,
  CustomersImportService,
  ExpensesImportService,
  ImportContextService,
  ImportFileParserService,
  ImportHistoryService,
  ImportLookupService,
  ImportRegistryService,
  ImportsService,
  ImportTransactionBuilderService,
  ItemsImportService,
  SalesImportService,
  TaxRatesImportService,
  VendorCreditsImportService,
  VendorsImportService,
} from './services';

/**
 * CSV/Excel import — the third way data enters the canonical records/*
 * tables, alongside the QuickBooks and Xero sync modules, for organizations
 * that keep their books in spreadsheets. Rows are written with
 * `SourceSystem.CSV` and no provider connection, so every dashboard chart,
 * finding and AI answer works on imported data unchanged.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DataImport]),
    RecordsModule,
    AnalyticsModule,
  ],
  controllers: [ImportsController],
  providers: [
    ImportsService,
    ImportHistoryService,
    ImportContextService,
    ImportFileParserService,
    ImportLookupService,
    ImportRegistryService,
    ImportTransactionBuilderService,
    VendorsImportService,
    CustomersImportService,
    CategoriesImportService,
    ItemsImportService,
    TaxRatesImportService,
    ExpensesImportService,
    VendorCreditsImportService,
    BillPaymentsImportService,
    SalesImportService,
    CustomerPaymentsImportService,
  ],
})
export class ImportsModule {}
