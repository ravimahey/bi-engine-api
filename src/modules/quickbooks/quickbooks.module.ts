import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsModule } from '@modules/analytics/analytics.module';
import { ProvidersModule } from '@modules/providers/providers.module';
import { RecordsModule } from '@modules/records/records.module';
import { QUICKBOOKS_REQUEST_TIMEOUT_MS } from './constants';
import { QuickbooksConnection } from './entities';
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
 * shape. There is no provider-specific "raw" storage layer: a fetched batch
 * maps straight into the single generic entity per business concept, so a
 * future Xero/Zoho module is a parallel converter writing into the same
 * canonical tables, not a fork of a raw layer. `QuickbooksConnection` is the
 * one entity this module still owns directly (legacy OAuth token storage,
 * not business data). Depends on `ProvidersModule` (shared connection
 * tracking) and `RecordsModule` (the canonical layer it writes into).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([QuickbooksConnection]),
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
