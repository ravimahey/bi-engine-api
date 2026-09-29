import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ProvidersModule } from '@modules/providers/providers.module';
import { RecordsModule } from '@modules/records/records.module';
import { XERO_REQUEST_TIMEOUT_MS } from './constants';
import {
  XeroApiClientService,
  XeroAuthService,
  XeroCreditPaymentMapperService,
  XeroEntitySyncService,
  XeroMasterDataMapperService,
  XeroOAuthClientService,
  XeroPollingService,
  XeroService,
  XeroSyncStatusService,
  XeroTransactionMapperService,
  XeroWebhookService,
} from './services';
import { XeroController } from './xero.controller';

/**
 * Xero integration — the parallel of `QuickbooksModule`. Owns the Xero
 * OAuth flow (with tenant resolution), the Accounting API client, and the
 * mappers that convert Xero responses directly into the canonical records/*
 * tables (`SourceSystem.XERO`). Same design as QuickBooks: no raw provider
 * tables, connection/tokens on the shared `provider_connections` row
 * (`externalRealmId` = tenant id), sync checkpoints in `sync_cursors`. Shares
 * no code with the QuickBooks module.
 */
@Module({
  imports: [
    HttpModule.register({ timeout: XERO_REQUEST_TIMEOUT_MS, maxRedirects: 5 }),
    ProvidersModule,
    RecordsModule,
  ],
  controllers: [XeroController],
  providers: [
    XeroOAuthClientService,
    XeroAuthService,
    XeroApiClientService,
    XeroService,
    XeroMasterDataMapperService,
    XeroTransactionMapperService,
    XeroCreditPaymentMapperService,
    XeroEntitySyncService,
    XeroPollingService,
    XeroSyncStatusService,
    XeroWebhookService,
  ],
})
export class XeroModule {}
