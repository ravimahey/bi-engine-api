import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConnectionStatus,
  ProviderConnection,
  ProviderType,
} from '../entities';
import type { UpsertProviderConnectionTokens } from '../types';

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

  async findById(id: string): Promise<ProviderConnection> {
    const connection = await this.connections.findOne({ where: { id } });

    if (!connection) {
      throw new NotFoundException(`Provider connection "${id}" was not found`);
    }

    return connection;
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

    return saved;
  }

  async markError(id: string, message: string): Promise<void> {
    await this.connections.update(id, {
      status: ConnectionStatus.ERROR,
      lastError: message,
    });
  }

  async markDisconnected(id: string): Promise<void> {
    await this.connections.update(id, {
      status: ConnectionStatus.DISCONNECTED,
      accessToken: null,
      refreshToken: null,
    });
  }
}
