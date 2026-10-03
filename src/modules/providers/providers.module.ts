import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { SignalsModule } from '@modules/signals/signals.module';
import { ProviderConnection, SyncCursor } from './entities';
import {
  ConnectionSignalsService,
  ProviderConnectionsService,
  SyncCursorsService,
} from './services';

/**
 * Shared, provider-agnostic connection tracking. `modules/quickbooks` (and
 * any future `modules/xero`/`modules/zoho`) import this module and depend on
 * its services — this module never imports a provider module back. It is
 * also the Integrations producer for Signals: a connection entering/leaving
 * `error` raises/resolves its `sync_error` signal (`ConnectionSignalsService`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProviderConnection, SyncCursor]),
    OrganizationsModule,
    SignalsModule,
  ],
  providers: [
    ProviderConnectionsService,
    SyncCursorsService,
    ConnectionSignalsService,
  ],
  exports: [ProviderConnectionsService, SyncCursorsService],
})
export class ProvidersModule {}
