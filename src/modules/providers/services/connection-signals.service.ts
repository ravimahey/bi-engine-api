import { Injectable, Logger } from '@nestjs/common';
import { SignalType } from '@modules/signals/entities';
import { SignalsService } from '@modules/signals/services';
import { PROVIDER_DISPLAY_NAMES } from '../constants';
import type { ProviderConnection } from '../entities';

type ConnectionRef = Pick<
  ProviderConnection,
  'id' | 'organizationId' | 'provider'
>;

/**
 * Integrations → Signals. Tells the inbox when a connection breaks and when
 * it stops being broken; the connection row itself stays the source of
 * truth for the status and the error detail.
 *
 * Never throws: a signal is a side effect of a status change, and failing
 * to raise one must not fail the token refresh or disconnect that caused it.
 */
@Injectable()
export class ConnectionSignalsService {
  private readonly logger = new Logger(ConnectionSignalsService.name);

  constructor(private readonly signals: SignalsService) {}

  /** The connection entered `error`. */
  async raiseSyncError(connection: ConnectionRef): Promise<void> {
    try {
      await this.signals.createSignal({
        organizationId: connection.organizationId,
        type: SignalType.SYNC_ERROR,
        sourceId: connection.id,
        message: `${PROVIDER_DISPLAY_NAMES[connection.provider]} sync failed — reconnect required.`,
      });
    } catch (error) {
      this.logFailure('raise', connection, error);
    }
  }

  /** The connection left `error` (reconnected, or disconnected on purpose). */
  async resolveSyncError(connection: ConnectionRef): Promise<void> {
    try {
      await this.signals.resolveSignal({
        organizationId: connection.organizationId,
        type: SignalType.SYNC_ERROR,
        sourceId: connection.id,
      });
    } catch (error) {
      this.logFailure('resolve', connection, error);
    }
  }

  private logFailure(
    action: string,
    connection: ConnectionRef,
    error: unknown,
  ): void {
    this.logger.error(
      `Could not ${action} the sync_error signal for connection ${connection.id}: ${(error as Error).message}`,
      (error as Error).stack,
    );
  }
}
