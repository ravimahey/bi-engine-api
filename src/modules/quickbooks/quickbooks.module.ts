import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AnalyticsModule } from '@modules/analytics/analytics.module';
import { ProvidersModule } from '@modules/providers/providers.module';
import { RecordsModule } from '@modules/records/records.module';
import { QUICKBOOKS_REQUEST_TIMEOUT_MS } from './constants';
import { QuickbooksController } from './quickbooks.controller';
import {
  QuickbooksApiClientService,
  QuickbooksAuthService,
  QuickbooksMasterDataMapperService,
  QuickbooksPollingService,
  QuickbooksReportsService,
  QuickbooksRevenueMapperService,
  QuickbooksService,
  QuickbooksSyncStatusService,
  QuickbooksTransactionMapperService,
} from './services';

/**
 * QuickBooks integration module. Owns the QuickBooks API client and the
 * OAuth flow specifics, and — via the three mapper services — converts
 * fetched QuickBooks API responses directly into the canonical records/*
 * shape. Depends on `ProvidersModule` (shared connection tracking) and
 * `RecordsModule` (the canonical layer it writes into).
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: QUICKBOOKS_REQUEST_TIMEOUT_MS,
      maxRedirects: 5,
    }),
    ProvidersModule,
    RecordsModule,
    AnalyticsModule,
  ],
  controllers: [QuickbooksController],
  providers: [
    QuickbooksAuthService,
    QuickbooksApiClientService,
    QuickbooksService,
    QuickbooksReportsService,
    QuickbooksMasterDataMapperService,
    QuickbooksTransactionMapperService,
    QuickbooksRevenueMapperService,
    QuickbooksPollingService,
    QuickbooksSyncStatusService,
  ],
})
export class QuickbooksModule {}
