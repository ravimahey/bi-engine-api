import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ExpenseTransactionLine,
  SalesTransactionLine,
} from '@modules/records/entities';
import { DashboardController } from './dashboard.controller';
import {
  RevenueVsSpendService,
  SpendBreakdownService,
  SpendTrendService,
} from './services';

/**
 * Read-only graph endpoints for the dashboard, built directly over the
 * canonical `records` line tables (same pattern as `analytics`). Additive —
 * `analytics` and `records` are untouched and never depend on this module.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ExpenseTransactionLine, SalesTransactionLine]),
  ],
  controllers: [DashboardController],
  providers: [SpendTrendService, SpendBreakdownService, RevenueVsSpendService],
})
export class DashboardModule {}
