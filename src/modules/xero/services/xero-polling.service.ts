import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization } from '@common/utils';
import type { ProviderConnection } from '@modules/providers/entities';
import { SyncCursorsService } from '@modules/providers/services';
import { UserRole } from '@modules/users/entities';
import {
  XERO_INCREMENTAL_ENTITIES,
  XERO_INCREMENTAL_OVERLAP_MS,
  XERO_POLL_ENTITY_ORDER,
} from '../constants';
import type { XeroPollEntity } from '../constants';
import type { XeroPollDto } from '../dto';
import type {
  XeroEntityPollResult,
  XeroPollOptions,
  XeroPollResult,
  XeroSyncRunState,
} from '../types';
import { toXeroModifiedSince } from '../utils';
import { XeroAuthService } from './xero-auth.service';
import { XeroEntitySyncService } from './xero-entity-sync.service';
import { XeroMasterDataMapperService } from './xero-master-data-mapper.service';
import { XeroService } from './xero.service';

/**
 * Orchestrates a Xero sync: resolve the connection → Organisation (Step 1,
 * always first) → each entity in fixed dependency order (Steps 2–9) → advance
 * that entity's `SyncCursor`. The cursor is the If-Modified-Since watermark
 * for the next incremental pull (Step 10), stored in the shared
 * `sync_cursors` table like QuickBooks' own cursors.
 *
 * Failure isolation matches `QuickbooksPollingService`: one entity failing
 * never stops the others, and a failed entity's cursor doesn't move, so its
 * next pull re-covers the same window.
 */
@Injectable()
export class XeroPollingService {
  private readonly logger = new Logger(XeroPollingService.name);

  // One poll per connection at a time. In-memory and per-process, same
  // trade-off as QuickbooksPollingService (single instance today).
  private readonly connectionsPolling = new Set<string>();

  // Webhook-triggered pulls that arrived while a poll was already running
  // for that connection — run as soon as it finishes instead of being lost.
  private readonly pendingEntities = new Map<string, Set<XeroPollEntity>>();

  constructor(
    private readonly xeroAuth: XeroAuthService,
    private readonly xeroService: XeroService,
    private readonly masterDataMapper: XeroMasterDataMapperService,
    private readonly entitySync: XeroEntitySyncService,
    private readonly syncCursors: SyncCursorsService,
  ) {}

  /** `POST /xero/poll` — non-admins may only sync their own organization. */
  async poll(
    dto: XeroPollDto,
    currentUser: AuthenticatedUser,
  ): Promise<XeroPollResult> {
    if (currentUser.role !== (UserRole.ADMIN as string)) {
      assertOwnOrganization(currentUser.organizationId, dto.organizationId);
    }

    const connection = await this.xeroAuth.ensureProviderConnection(
      dto.organizationId,
    );
    if (this.connectionsPolling.has(connection.id)) {
      throw new ConflictException(
        'A Xero poll is already running for this connection',
      );
    }

    return this.runLocked(connection, {
      entities: dto.entities,
      fullSync: dto.fullSync,
      fromDate: dto.fromDate,
    });
  }

  /**
   * Webhook path — an incremental pull of just `entities`, fired without the
   * caller waiting (Xero wants its 200 within 5 seconds). If a poll is
   * already running for this connection, the entities are queued and pulled
   * right after it.
   */
  pollInBackground(
    connection: ProviderConnection,
    entities: XeroPollEntity[],
  ): void {
    if (this.connectionsPolling.has(connection.id)) {
      const pending = this.pendingEntities.get(connection.id) ?? new Set();
      entities.forEach((entity) => pending.add(entity));
      this.pendingEntities.set(connection.id, pending);
      return;
    }

    this.runLocked(connection, { entities }).catch((error: Error) =>
      this.logger.error(
        `Background Xero pull failed for connection ${connection.id}: ${error.message}`,
        error.stack,
      ),
    );
  }

  private async runLocked(
    connection: ProviderConnection,
    options: XeroPollOptions,
  ): Promise<XeroPollResult> {
    this.connectionsPolling.add(connection.id);
    try {
      return await this.runPoll(connection, options);
    } finally {
      this.connectionsPolling.delete(connection.id);
      this.drainPending(connection);
    }
  }

  private drainPending(connection: ProviderConnection): void {
    const pending = this.pendingEntities.get(connection.id);
    if (!pending?.size) return;

    this.pendingEntities.delete(connection.id);
    this.pollInBackground(connection, [...pending]);
  }

  private async runPoll(
    connection: ProviderConnection,
    options: XeroPollOptions,
  ): Promise<XeroPollResult> {
    const requested = new Set(
      options.entities?.length ? options.entities : XERO_POLL_ENTITY_ORDER,
    );
    // Always the fixed dependency order, never the order the caller listed.
    const ordered = XERO_POLL_ENTITY_ORDER.filter((entity) =>
      requested.has(entity),
    );

    const state: XeroSyncRunState = {
      context: {
        organizationId: connection.organizationId,
        sourceConnectionId: connection.id,
        baseCurrency: null,
      },
    };

    const entities: XeroEntityPollResult[] = [
      await this.pollOrganisation(connection, state),
    ];
    for (const entity of ordered) {
      entities.push(await this.pollEntity(entity, connection, state, options));
    }

    return {
      organizationId: connection.organizationId,
      providerConnectionId: connection.id,
      tenantId: connection.externalRealmId,
      entities,
    };
  }

  /** Step 1 — confirms the connection is live and captures base currency before any transaction is mapped. */
  private async pollOrganisation(
    connection: ProviderConnection,
    state: XeroSyncRunState,
  ): Promise<XeroEntityPollResult> {
    try {
      const organisation = await this.xeroService.getOrganisation(
        connection.organizationId,
      );
      await this.masterDataMapper.mapOrganisation(organisation, state.context);
      state.context.baseCurrency = organisation?.BaseCurrency ?? null;

      const cursor = new Date().toISOString();
      await this.syncCursors.upsert(connection.id, 'Organisation', cursor);
      return {
        entity: 'Organisation',
        status: 'full',
        recordsFetched: organisation ? 1 : 0,
        cursor,
      };
    } catch (error) {
      return this.failure('Organisation', connection, error);
    }
  }

  private async pollEntity(
    entity: XeroPollEntity,
    connection: ProviderConnection,
    state: XeroSyncRunState,
    options: XeroPollOptions,
  ): Promise<XeroEntityPollResult> {
    try {
      const existing = await this.syncCursors.get(connection.id, entity);
      const incremental =
        !options.fullSync &&
        !!existing &&
        XERO_INCREMENTAL_ENTITIES.includes(entity);

      // Captured before fetching, so anything modified mid-pull is re-read next time.
      const startedAt = new Date().toISOString();
      const recordsFetched = await this.entitySync.sync(entity, state, {
        ifModifiedSince: incremental
          ? toXeroModifiedSince(existing.cursor, XERO_INCREMENTAL_OVERLAP_MS)
          : undefined,
        fromDate: incremental ? undefined : options.fromDate,
      });

      await this.syncCursors.upsert(connection.id, entity, startedAt);
      return {
        entity,
        status: incremental ? 'incremental' : 'full',
        recordsFetched,
        cursor: startedAt,
      };
    } catch (error) {
      return this.failure(entity, connection, error);
    }
  }

  private async failure(
    entity: XeroEntityPollResult['entity'],
    connection: ProviderConnection,
    error: unknown,
  ): Promise<XeroEntityPollResult> {
    const message = (error as Error).message;
    this.logger.error(
      `Xero poll failed for ${entity} (connection ${connection.id}): ${message}`,
      (error as Error).stack,
    );
    const existing = await this.syncCursors.get(connection.id, entity);
    return {
      entity,
      status: 'failed',
      recordsFetched: 0,
      cursor: existing?.cursor ?? null,
      error: message,
    };
  }
}
