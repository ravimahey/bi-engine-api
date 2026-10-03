import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization } from '@common/utils';
import { FindingSignalsService } from '@modules/analytics/services';
import type { ProviderConnection } from '@modules/providers/entities';
import { SyncCursorsService } from '@modules/providers/services';
import { UserRole } from '@modules/users/entities';
import {
  QUICKBOOKS_POLL_ENTITY_ORDER,
  QUICKBOOKS_POLL_MASTER_DATA_ENTITIES,
} from '../constants';
import type { QuickbooksPollEntity } from '../constants';
import type { QuickbooksPollDto } from '../dto';
import type {
  QuickbooksEntityPollResult,
  QuickbooksMapContext,
  QuickbooksPollResult,
} from '../types';
import { buildDateChunks, toExclusiveEndDate } from '../utils';
import { QuickbooksAuthService } from './quickbooks-auth.service';
import { QuickbooksMasterDataMapperService } from './quickbooks-master-data-mapper.service';
import { QuickbooksRevenueMapperService } from './quickbooks-revenue-mapper.service';
import { QuickbooksService } from './quickbooks.service';
import { QuickbooksTransactionMapperService } from './quickbooks-transaction-mapper.service';

/**
 * Central orchestrator for `POST /quickbooks/poll` — the one place that
 * decides *what* gets synced and *in what order*, delegating every actual
 * QuickBooks call and canonical mapping to the existing services that
 * already own those responsibilities. Flow: resolve connection → walk
 * entities in dependency order → read SyncCursor → chunk the remaining date
 * range → fetch (paginated) → map straight into the canonical records/*
 * shape → advance cursor. There is deliberately no raw-storage step in
 * between — the fetched batch maps directly into canonical rows.
 *
 * Two failure-isolation rules drive the control flow here:
 *  - one entity's failure never stops another entity's poll (separate
 *    try/catch per entity), and
 *  - one chunk's failure stops that entity's *own* remaining chunks — the
 *    cursor stays at the end of the last chunk that fully succeeded.
 */
@Injectable()
export class QuickbooksPollingService {
  private readonly logger = new Logger(QuickbooksPollingService.name);

  // Guards against two overlapping polls for the same connection. Purely
  // in-memory and per-process by design — the task explicitly rules out a
  // new batching/lock table, and this app runs sequentially/single-instance
  // today; a multi-instance deployment would need a real distributed lock,
  // which is out of scope here.
  private readonly connectionsPolling = new Set<string>();

  constructor(
    private readonly quickbooksAuth: QuickbooksAuthService,
    private readonly quickbooksService: QuickbooksService,
    private readonly masterDataMapper: QuickbooksMasterDataMapperService,
    private readonly transactionMapper: QuickbooksTransactionMapperService,
    private readonly revenueMapper: QuickbooksRevenueMapperService,
    private readonly syncCursors: SyncCursorsService,
    private readonly findingSignals: FindingSignalsService,
  ) {}

  async poll(
    dto: QuickbooksPollDto,
    currentUser: AuthenticatedUser,
  ): Promise<QuickbooksPollResult> {
    if (currentUser.role !== (UserRole.ADMIN as string)) {
      assertOwnOrganization(currentUser.organizationId, dto.organizationId);
    }

    const providerConnection =
      await this.quickbooksAuth.ensureProviderConnection(dto.organizationId);

    if (this.connectionsPolling.has(providerConnection.id)) {
      throw new ConflictException(
        'A QuickBooks poll is already running for this connection',
      );
    }
    this.connectionsPolling.add(providerConnection.id);

    try {
      const result = await this.runPoll(dto, providerConnection);
      // The organization's records just changed — let the BI detectors
      // raise/resolve its finding signals. Never throws.
      await this.findingSignals.refreshForOrganization(dto.organizationId);
      return result;
    } finally {
      this.connectionsPolling.delete(providerConnection.id);
    }
  }

  private async runPoll(
    dto: QuickbooksPollDto,
    providerConnection: ProviderConnection,
  ): Promise<QuickbooksPollResult> {
    const requested = new Set(
      dto.entities?.length ? dto.entities : QUICKBOOKS_POLL_ENTITY_ORDER,
    );
    // Always walk the fixed dependency order — never whatever order the caller listed `entities` in.
    const orderedEntities = QUICKBOOKS_POLL_ENTITY_ORDER.filter((entity) =>
      requested.has(entity),
    );

    const context: QuickbooksMapContext = {
      organizationId: dto.organizationId,
      sourceConnectionId: providerConnection.id,
    };
    const exclusiveEndDate = toExclusiveEndDate(dto.toDate);

    // Step 0 — always runs first, unconditionally, never part of `entities`
    // filtering: confirms the connection and captures fiscal year/currency
    // before anything else is pulled, per the QuickBooks API Build Order.
    const entities: QuickbooksEntityPollResult[] = [
      await this.pollCompanyInfo(
        providerConnection.id,
        dto.organizationId,
        context,
      ),
    ];

    for (const entity of orderedEntities) {
      const result = QUICKBOOKS_POLL_MASTER_DATA_ENTITIES.includes(entity)
        ? await this.pollMasterDataEntity(
            entity,
            providerConnection.id,
            context,
            dto.organizationId,
          )
        : await this.pollTransactionalEntity(
            entity,
            providerConnection.id,
            context,
            dto.fromDate,
            exclusiveEndDate,
            dto.organizationId,
          );
      entities.push(result);
    }

    return {
      organizationId: dto.organizationId,
      providerConnectionId: providerConnection.id,
      entities,
    };
  }

  /**
   * Step 0 — CompanyInfo. Not a list entity, so it bypasses `fetchAllPages`/
   * `mapToCanonical` entirely and calls the master-data mapper's singleton
   * method directly. Never aborts the rest of the poll on failure, same
   * failure-isolation rule as every other entity — a stale/missing
   * CompanyInfo row is worth logging, not worth blocking master data and
   * transactions behind.
   */
  private async pollCompanyInfo(
    providerConnectionId: string,
    organizationId: string,
    context: QuickbooksMapContext,
  ): Promise<QuickbooksEntityPollResult> {
    try {
      const raw = await this.quickbooksService.getCompanyInfo(organizationId);
      await this.masterDataMapper.mapCompanyInfo(raw, context);

      const cursor = new Date().toISOString();
      await this.syncCursors.upsert(
        providerConnectionId,
        'CompanyInfo',
        cursor,
      );

      return {
        entity: 'CompanyInfo',
        status: 'completed',
        chunksCompleted: 1,
        recordsSynced: raw ? 1 : 0,
        cursor,
      };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(
        `QuickBooks poll failed for CompanyInfo (connection ${providerConnectionId}): ${message}`,
        (error as Error).stack,
      );
      const existingCursor = await this.syncCursors.get(
        providerConnectionId,
        'CompanyInfo',
      );
      return {
        entity: 'CompanyInfo',
        status: 'failed',
        chunksCompleted: 0,
        recordsSynced: 0,
        cursor: existingCursor?.cursor ?? null,
        error: message,
      };
    }
  }

  /**
   * Master/reference data (Vendor, Account, Item, TaxRate, TaxCode,
   * Customer) has no meaningful `TxnDate`, so it is never date-chunked —
   * every poll re-fetches it in full (still paginated) and the cursor just
   * records when that last happened, for observability, not resumability.
   */
  private async pollMasterDataEntity(
    entity: QuickbooksPollEntity,
    providerConnectionId: string,
    context: QuickbooksMapContext,
    organizationId: string,
  ): Promise<QuickbooksEntityPollResult> {
    try {
      const raw = await this.quickbooksService.fetchAllPages(
        entity,
        undefined,
        organizationId,
      );
      await this.mapToCanonical(entity, raw, context);

      const cursor = new Date().toISOString();
      await this.syncCursors.upsert(providerConnectionId, entity, cursor);

      return {
        entity,
        status: 'completed',
        chunksCompleted: 1,
        recordsSynced: raw.length,
        cursor,
      };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(
        `QuickBooks poll failed for ${entity} (connection ${providerConnectionId}): ${message}`,
        (error as Error).stack,
      );
      const existingCursor = await this.syncCursors.get(
        providerConnectionId,
        entity,
      );
      return {
        entity,
        status: 'failed',
        chunksCompleted: 0,
        recordsSynced: 0,
        cursor: existingCursor?.cursor ?? null,
        error: message,
      };
    }
  }

  /**
   * Date-based transactions (Bill, Purchase, VendorCredit, BillPayment).
   * Resumes from the entity's own `SyncCursor` — never re-fetching a chunk
   * already completed by a prior run — then walks the remaining chunks in
   * order, persisting each fully before advancing the cursor to its end.
   */
  private async pollTransactionalEntity(
    entity: QuickbooksPollEntity,
    providerConnectionId: string,
    context: QuickbooksMapContext,
    fromDate: string,
    exclusiveEndDate: string,
    organizationId: string,
  ): Promise<QuickbooksEntityPollResult> {
    const existingCursor = await this.syncCursors.get(
      providerConnectionId,
      entity,
    );
    const effectiveStart =
      existingCursor && existingCursor.cursor > fromDate
        ? existingCursor.cursor
        : fromDate;

    if (effectiveStart >= exclusiveEndDate) {
      return {
        entity,
        status: 'skipped',
        chunksCompleted: 0,
        recordsSynced: 0,
        cursor: existingCursor?.cursor ?? null,
      };
    }

    const chunks = buildDateChunks(effectiveStart, exclusiveEndDate);
    let chunksCompleted = 0;
    let recordsSynced = 0;
    let cursor = existingCursor?.cursor ?? null;

    for (const chunk of chunks) {
      try {
        const where = `TxnDate >= '${chunk.startDate}' AND TxnDate < '${chunk.endDate}'`;
        const raw = await this.quickbooksService.fetchAllPages(
          entity,
          where,
          organizationId,
        );
        await this.mapToCanonical(entity, raw, context);

        // Cursor advances only now — after fetch + canonical mapping have
        // both succeeded for this chunk, never mid-chunk.
        await this.syncCursors.upsert(
          providerConnectionId,
          entity,
          chunk.endDate,
        );

        cursor = chunk.endDate;
        chunksCompleted += 1;
        recordsSynced += raw.length;
      } catch (error) {
        const message = (error as Error).message;
        this.logger.error(
          `QuickBooks poll failed for ${entity} chunk [${chunk.startDate}, ${chunk.endDate}) on connection ${providerConnectionId}: ${message}`,
          (error as Error).stack,
        );
        return {
          entity,
          status: chunksCompleted > 0 ? 'partial' : 'failed',
          chunksCompleted,
          recordsSynced,
          cursor,
          error: message,
        };
      }
    }

    return {
      entity,
      status: 'completed',
      chunksCompleted,
      recordsSynced,
      cursor,
    };
  }

  /**
   * Dispatches a fetched batch straight to the entity's canonical mapper —
   * no raw-storage step in between. `raw` is the in-memory result of this
   * chunk/page's `fetchAllPages` call; the mapper converts and upserts it
   * directly into the canonical `records/*` tables.
   */
  private mapToCanonical(
    entity: QuickbooksPollEntity,
    raw: unknown[],
    context: QuickbooksMapContext,
  ): Promise<void> {
    if (raw.length === 0) return Promise.resolve();

    switch (entity) {
      case 'Vendor':
        return this.masterDataMapper.mapVendors(raw, context);
      case 'Account':
        return this.masterDataMapper.mapAccounts(raw, context);
      case 'Item':
        return this.masterDataMapper.mapItems(raw, context);
      case 'TaxRate':
        return this.masterDataMapper.mapTaxRates(raw, context);
      case 'TaxCode':
        return this.masterDataMapper.mapTaxCodes(raw, context);
      case 'Customer':
        return this.revenueMapper.mapCustomers(raw, context);
      case 'Bill':
        return this.transactionMapper.mapBills(raw, context);
      case 'Purchase':
        return this.transactionMapper.mapPurchases(raw, context);
      case 'VendorCredit':
        return this.transactionMapper.mapVendorCredits(raw, context);
      case 'BillPayment':
        return this.transactionMapper.mapBillPayments(raw, context);
      case 'Invoice':
        return this.revenueMapper.mapInvoices(raw, context);
      case 'SalesReceipt':
        return this.revenueMapper.mapSalesReceipts(raw, context);
      case 'Payment':
        return this.revenueMapper.mapPayments(raw, context);
    }
  }
}
