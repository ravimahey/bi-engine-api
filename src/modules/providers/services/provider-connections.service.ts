import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConnectionStatus,
  ProviderConnection,
  ProviderType,
} from '../entities';
import type { UpsertProviderConnectionTokens } from '../types';
import { ConnectionSignalsService } from './connection-signals.service';

const TOKEN_COLUMNS = {
  id: true,
  organizationId: true,
  provider: true,
  externalRealmId: true,
  status: true,
  accessToken: true,
  refreshToken: true,
  accessTokenExpiresAt: true,
  refreshTokenExpiresAt: true,
} as const;

/**
 * Owns `provider_connections` CRUD — the one place any provider module
 * (`modules/quickbooks` today, `modules/xero` tomorrow) reads or writes
 * connection/token state. Provider modules depend on this service; this
 * service knows nothing about any single provider's API shape.
 */
@Injectable()
export class ProviderConnectionsService {
  private readonly logger = new Logger(ProviderConnectionsService.name);

  constructor(
    @InjectRepository(ProviderConnection)
    private readonly connections: Repository<ProviderConnection>,
    private readonly connectionSignals: ConnectionSignalsService,
  ) {}

  /** Finds the connection for a tenant + provider, tokens included — callers own refresh. */
  async findWithTokens(
    organizationId: string,
    provider: ProviderType,
  ): Promise<ProviderConnection> {
    const connection = await this.findWithTokensOrNull(
      organizationId,
      provider,
    );

    if (!connection) {
      throw new NotFoundException(
        `No ${provider} connection for organization "${organizationId}"`,
      );
    }

    return connection;
  }

  /**
   * Same as `findWithTokens`, but returns `null` instead of throwing —
   * for callers that need to distinguish "this tenant has never connected
   * this provider yet" from an actual error, e.g. deciding whether to bridge
   * a brand-new connection versus reusing/refreshing an existing one.
   */
  async findWithTokensOrNull(
    organizationId: string,
    provider: ProviderType,
  ): Promise<ProviderConnection | null> {
    return this.connections.findOne({
      where: { organizationId, provider },
      select: TOKEN_COLUMNS,
    });
  }

  /**
   * Same as `findWithTokensOrNull`, but leaves the (`select: false`) token
   * columns unselected — for callers that only need the connection's
   * id/status, e.g. a sync-status read, that have no business loading
   * encrypted tokens into memory just to report freshness.
   */
  async findOrNull(
    organizationId: string,
    provider: ProviderType,
  ): Promise<ProviderConnection | null> {
    return this.connections.findOne({ where: { organizationId, provider } });
  }

  /**
   * Every connected organization bound to one provider-side tenant/realm —
   * how an inbound webhook (which only names the provider's tenant, never
   * our organization) is routed back to the right connection(s). More than
   * one organization may legitimately have authorized the same tenant.
   */
  async findConnectedByExternalRealmId(
    provider: ProviderType,
    externalRealmId: string,
  ): Promise<ProviderConnection[]> {
    return this.connections.find({
      where: {
        provider,
        externalRealmId,
        status: ConnectionStatus.CONNECTED,
      },
    });
  }

  async findById(id: string): Promise<ProviderConnection> {
    const connection = await this.connections.findOne({ where: { id } });

    if (!connection) {
      throw new NotFoundException(`Provider connection "${id}" was not found`);
    }

    return connection;
  }

  /**
   * Finds the most recently updated connection for a provider across all tenants,
   * tokens included — fallback for single-session / admin callers.
   */
  async findLatestWithTokensOrNull(
    provider: ProviderType,
  ): Promise<ProviderConnection | null> {
    return this.connections.findOne({
      where: {
        provider,
        status: ConnectionStatus.CONNECTED,
      },
      order: { updatedAt: 'DESC' },
      select: TOKEN_COLUMNS,
    });
  }

  /** Creates the connection on first OAuth consent, or rotates tokens on every refresh since. */
  async upsertTokens(
    input: UpsertProviderConnectionTokens,
  ): Promise<ProviderConnection> {
    const existing = await this.connections.findOne({
      where: {
        organizationId: input.organizationId,
        provider: input.provider,
      },
    });

    const connection =
      existing ??
      this.connections.create({
        organizationId: input.organizationId,
        provider: input.provider,
      });

    const wasInError = existing?.status === ConnectionStatus.ERROR;

    connection.externalRealmId = input.externalRealmId;
    connection.accessToken = input.accessToken;
    connection.refreshToken = input.refreshToken;
    connection.accessTokenExpiresAt = input.accessTokenExpiresAt;
    connection.refreshTokenExpiresAt = input.refreshTokenExpiresAt;
    connection.status = ConnectionStatus.CONNECTED;
    connection.lastError = null;
    connection.connectedAt ??= new Date();

    const saved = await this.connections.save(connection);
    this.logger.log(
      `Upserted ${input.provider} connection ${saved.id} for org ${input.organizationId}`,
    );

    // error → connected: the sync-error signal is no longer true.
    if (wasInError) await this.connectionSignals.resolveSyncError(saved);

    return saved;
  }

  async markError(id: string, message: string): Promise<void> {
    const connection = await this.findStatusRef(id);

    await this.connections.update(id, {
      status: ConnectionStatus.ERROR,
      lastError: message,
    });

    // Only the transition into `error` is news — a retry that fails again
    // while already in `error` must not re-raise a signal the user dismissed.
    if (connection && connection.status !== ConnectionStatus.ERROR) {
      await this.connectionSignals.raiseSyncError(connection);
    }
  }

  async markDisconnected(id: string): Promise<void> {
    const connection = await this.findStatusRef(id);

    await this.connections.update(id, {
      status: ConnectionStatus.DISCONNECTED,
      accessToken: null,
      refreshToken: null,
    });

    if (connection?.status === ConnectionStatus.ERROR) {
      await this.connectionSignals.resolveSyncError(connection);
    }
  }

  /** The connection's state just before a status change — what decides whether the change is a transition worth signalling. */
  private findStatusRef(id: string): Promise<ProviderConnection | null> {
    return this.connections.findOne({
      where: { id },
      select: { id: true, organizationId: true, provider: true, status: true },
    });
  }
}
