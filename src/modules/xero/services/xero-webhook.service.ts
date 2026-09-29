import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAppConfig } from '@common/utils';
import { ProviderType } from '@modules/providers/entities';
import { ProviderConnectionsService } from '@modules/providers/services';
import { XERO_WEBHOOK_CATEGORY_ENTITY } from '../constants';
import type { XeroPollEntity } from '../constants';
import type { XeroWebhookPayload } from '../types';
import { isValidXeroWebhookSignature } from '../utils';
import { XeroPollingService } from './xero-polling.service';

/**
 * Step 11 — validates Xero webhooks and turns them into targeted re-pulls.
 * A Xero webhook only says "something changed" (tenant + category + id),
 * never the data, so this never writes records itself: it starts a
 * background incremental pull of the affected entity through the normal
 * sync pipeline and returns immediately, well inside Xero's 5-second limit.
 */
@Injectable()
export class XeroWebhookService {
  private readonly logger = new Logger(XeroWebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly providerConnections: ProviderConnectionsService,
    private readonly polling: XeroPollingService,
  ) {}

  /**
   * Returns `false` for a bad signature, which the controller answers with
   * a 401. That's also what Xero's intent-to-receive check expects for its
   * deliberately mis-signed request; the correctly signed one (empty
   * `events`) returns `true` and gets a 200.
   */
  async handle(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<boolean> {
    const { webhookSecret } = getAppConfig(this.configService).xero;
    if (!isValidXeroWebhookSignature(rawBody, signature, webhookSecret)) {
      this.logger.warn('Rejected Xero webhook with an invalid signature');
      return false;
    }

    const payload = this.parse(rawBody);
    const entitiesByTenant = new Map<string, Set<XeroPollEntity>>();
    for (const event of payload.events ?? []) {
      const entity = XERO_WEBHOOK_CATEGORY_ENTITY[event.eventCategory ?? ''];
      if (!event.tenantId || !entity) continue;

      const entities = entitiesByTenant.get(event.tenantId) ?? new Set();
      entities.add(entity);
      entitiesByTenant.set(event.tenantId, entities);
    }

    for (const [tenantId, entities] of entitiesByTenant) {
      const connections =
        await this.providerConnections.findConnectedByExternalRealmId(
          ProviderType.XERO,
          tenantId,
        );
      if (!connections.length) {
        this.logger.warn(`Xero webhook for unknown tenant ${tenantId} ignored`);
      }
      for (const connection of connections) {
        this.polling.pollInBackground(connection, [...entities]);
      }
    }
    return true;
  }

  private parse(rawBody: Buffer | undefined): XeroWebhookPayload {
    try {
      return JSON.parse(
        rawBody?.toString('utf8') ?? '{}',
      ) as XeroWebhookPayload;
    } catch {
      this.logger.warn('Signed Xero webhook body was not valid JSON');
      return {};
    }
  }
}
