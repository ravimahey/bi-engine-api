import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization } from '@common/utils';
import { ProviderType } from '@modules/providers/entities';
import {
  ProviderConnectionsService,
  SyncCursorsService,
} from '@modules/providers/services';
import { UserRole } from '@modules/users/entities';
import { XERO_SYNC_STATUS_ENTITIES } from '../constants';
import type { XeroSyncStatusResult } from '../types';

/**
 * Backs `GET /xero/sync-status`: one row per entity `XeroPollingService`
 * can sync, with its cursor/last-synced time, or nulls if never synced — so
 * the frontend never has to know the entity list itself. Same shape as
 * `QuickbooksSyncStatusService`.
 */
@Injectable()
export class XeroSyncStatusService {
  constructor(
    private readonly providerConnections: ProviderConnectionsService,
    private readonly syncCursors: SyncCursorsService,
  ) {}

  async getSyncStatus(
    organizationId: string,
    currentUser: AuthenticatedUser,
  ): Promise<XeroSyncStatusResult> {
    if (currentUser.role !== (UserRole.ADMIN as string)) {
      assertOwnOrganization(currentUser.organizationId, organizationId);
    }

    const connection = await this.providerConnections.findOrNull(
      organizationId,
      ProviderType.XERO,
    );
    const cursors = connection
      ? await this.syncCursors.findAllForConnection(connection.id)
      : [];
    const byEntity = new Map(cursors.map((c) => [c.entityType, c]));

    return {
      organizationId,
      providerConnectionId: connection?.id ?? null,
      connectionStatus: connection?.status ?? null,
      entities: XERO_SYNC_STATUS_ENTITIES.map((entity) => ({
        entity,
        cursor: byEntity.get(entity)?.cursor ?? null,
        lastSyncedAt: byEntity.get(entity)?.lastSyncedAt ?? null,
      })),
    };
  }
}
