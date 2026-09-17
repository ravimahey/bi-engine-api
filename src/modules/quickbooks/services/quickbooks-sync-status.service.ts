import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization } from '@common/utils';
import { ProviderType } from '@modules/providers/entities';
import {
  ProviderConnectionsService,
  SyncCursorsService,
} from '@modules/providers/services';
import { UserRole } from '@modules/users/entities';
import { QUICKBOOKS_SYNC_STATUS_ENTITIES } from '../constants';
import type { QuickbooksSyncStatusQueryDto } from '../dto';
import type {
  QuickbooksSyncStatusEntity,
  QuickbooksSyncStatusResult,
} from '../types';

/**
 * Backs `GET /quickbooks/sync-status` — reports `SyncCursorsService`'s
 * checkpoint for every entity `QuickbooksPollingService` can sync, even ones
 * this connection has never synced yet (`cursor`/`lastSyncedAt` come back
 * null), so the frontend always gets one row per entity instead of having to
 * know the entity list itself. Doesn't touch the canonical `records/*`
 * tables at all — this is provider-connection metadata, not business data,
 * which is why it lives here rather than on `RecordsController`.
 */
@Injectable()
export class QuickbooksSyncStatusService {
  constructor(
    private readonly providerConnections: ProviderConnectionsService,
    private readonly syncCursors: SyncCursorsService,
  ) {}

  async getSyncStatus(
    query: QuickbooksSyncStatusQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<QuickbooksSyncStatusResult> {
    if (currentUser.role !== (UserRole.ADMIN as string)) {
      assertOwnOrganization(currentUser.organizationId, query.organizationId);
    }

    const connection = await this.providerConnections.findOrNull(
      query.organizationId,
      ProviderType.QUICKBOOKS,
    );

    const cursors = connection
      ? await this.syncCursors.findAllForConnection(connection.id)
      : [];
    const cursorByEntity = new Map(cursors.map((c) => [c.entityType, c]));

    const entities: QuickbooksSyncStatusEntity[] =
      QUICKBOOKS_SYNC_STATUS_ENTITIES.map((entity) => {
        const cursor = cursorByEntity.get(entity);
        return {
          entity,
          cursor: cursor?.cursor ?? null,
          lastSyncedAt: cursor?.lastSyncedAt ?? null,
        };
      });

    return {
      organizationId: query.organizationId,
      providerConnectionId: connection?.id ?? null,
      connectionStatus: connection?.status ?? null,
      entities,
    };
  }
}
