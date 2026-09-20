import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ExpenseTransaction,
  ExpenseTransactionLine,
} from '@modules/records/entities';
import { AnalyticsController } from './analytics.controller';
import {
  CostIncreaseFindingService,
  DataQualityService,
  DuplicateDetectionService,
  ExpenseSummaryService,
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
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ExpenseTransactionLine, ExpenseTransaction]),
  ],
  controllers: [AnalyticsController],
  providers: [
    ExpenseSummaryService,
    DuplicateDetectionService,
    CostIncreaseFindingService,
    DataQualityService,
  ],
  exports: [
    ExpenseSummaryService,
    DuplicateDetectionService,
    CostIncreaseFindingService,
    DataQualityService,
  ],
})
export class AnalyticsModule {}
