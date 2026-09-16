import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { ProviderConnection, SyncCursor } from './entities';
import { ProviderConnectionsService, SyncCursorsService } from './services';

/**
 * Shared, provider-agnostic connection tracking. `modules/quickbooks` (and
 * any future `modules/xero`/`modules/zoho`) import this module and depend on
 * its services — this module never imports a provider module back.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProviderConnection, SyncCursor]),
    OrganizationsModule,
  ],
  providers: [ProviderConnectionsService, SyncCursorsService],
  exports: [ProviderConnectionsService, SyncCursorsService],
})
export class ProvidersModule {}
