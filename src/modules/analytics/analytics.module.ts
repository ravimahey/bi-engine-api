import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ExpenseTransaction,
  ExpenseTransactionLine,
} from '@modules/records/entities';
import { SignalsModule } from '@modules/signals/signals.module';
import { AnalyticsController } from './analytics.controller';
import {
  CategoryPriceIncreaseScanService,
  CostIncreaseFindingService,
  DataQualityService,
  DuplicateDetectionService,
  ExpenseSummaryService,
  FindingSignalsService,
} from './services';

/**
 * Calculation layer over the canonical `records` tables, all surfaced under
 * one `/analytics` router — FINDINGS_AND_AI_CALCULATION_GUIDE.md §4.1
 * (dashboard KPI totals), §4.2 (duplicate invoice detection), §4.3
 * (category/supplier cost-increase findings), and §4.4 (missing/wrong
 * transaction data quality) — the full findings engine described there.
 * Depends on `records`' entities only (read-only, via
 * `TypeOrmModule.forFeature`); `records` never depends back on this module.
 * Exports its services so a future `findings-ai` module can wrap them as
 * LangChain tools without duplicating the queries.
 *
 * Also the BI producer for Signals: `FindingSignalsService` re-runs the
 * detectors for one organization after its data changes and raises/resolves
 * the matching signals. The sync and import modules call it; Signals itself
 * never computes a finding.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ExpenseTransactionLine, ExpenseTransaction]),
    SignalsModule,
  ],
  controllers: [AnalyticsController],
  providers: [
    ExpenseSummaryService,
    DuplicateDetectionService,
    CostIncreaseFindingService,
    DataQualityService,
    CategoryPriceIncreaseScanService,
    FindingSignalsService,
  ],
  exports: [
    ExpenseSummaryService,
    DuplicateDetectionService,
    CostIncreaseFindingService,
    DataQualityService,
    FindingSignalsService,
  ],
})
export class AnalyticsModule {}
