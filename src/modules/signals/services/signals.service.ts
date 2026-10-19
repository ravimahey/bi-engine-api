import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ACTIVE_SIGNAL_STATUSES, SIGNAL_TYPES } from '../constants';
import { Signal, SignalDismissedBy, SignalStatus, SignalType } from '../entities';
import type {
  CreateSignalInput,
  CreateSignalOptions,
  ResolveStaleSignalsInput,
  SignalKey,
} from '../types';

/**
 * The single entry point producers (Commerce, the BI detectors,
 * Integrations) use to raise and clear signals — nothing else writes signal
 * rows. It records *that* something needs attention and where; it never
 * calculates, and never reads the source record.
 *
 * Producers own the fact and call in on a state change:
 *  - the source enters a state worth attention  → `createSignal`
 *  - the source leaves that state               → `resolveSignal`
 */
@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(
    @InjectRepository(Signal)
    private readonly signals: Repository<Signal>,
  ) {}

  /**
   * Raises a signal, or does nothing if an active one already exists for the
   * same (organization, type, source) — so re-processing an event, or a job
   * re-reporting the same condition every day, never stacks duplicates. The
   * guarantee is the database's (`idx_signals_dedup_active`), not a
   * check-then-insert, so it holds under concurrency too.
   *
   * Returns the active signal for the key (new or pre-existing), or `null`
   * when `skipIfUserDismissed` suppressed it.
   */
  async createSignal(
    input: CreateSignalInput,
    _options: CreateSignalOptions = {},
  ): Promise<Signal | null> {
    const definition = SIGNAL_TYPES[input.type];
    if (!definition) {
      throw new Error(`Unknown signal type "${String(input.type)}"`);
    }
    if (!input.message.trim()) {
      throw new Error(`Signal "${input.type}" needs a message`);
    }

    const key = this.toWhere(input);

    // Check if ANY signal already exists for this source record in this organization:
    const existing = await this.signals.findOne({
      where: key,
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      // 1. If it was dismissed (by user or closed): DO NOT RE-CREATE ON SYNC!
      // Once dismissed, it stays dismissed.
      if (existing.status === SignalStatus.DISMISSED) {
        return null;
      }

      // 2. If it is active (unread or in Needs Attention / read):
      // SKIP OVERWRITE completely! Preserve its existing status, metadata and original timestamp!
      if (existing.status === SignalStatus.UNREAD || existing.status === SignalStatus.READ) {
        if (input.metadata) {
          existing.metadata = input.metadata;
        }
        return existing;
      }
    }

    // 3. Genuinely new signal — insert into PostgreSQL
    const result = await this.signals
      .createQueryBuilder()
      .insert()
      .into(Signal)
      .values({
        ...key,
        severity: definition.severity,
        title: input.title?.trim() || definition.title,
        message: input.message.trim(),
      })
      .orIgnore()
      .execute();

    if ((result.raw as unknown[]).length > 0) {
      this.logger.log(
        `Created ${input.type} signal for org ${input.organizationId} (source ${input.sourceId})`,
      );
    }

    const created = await this.signals.findOne({
      where: { ...key, status: In(ACTIVE_SIGNAL_STATUSES) },
    });

    if (created && input.metadata) {
      created.metadata = input.metadata;
    }

    return created;
  }

  async findById(signalId: string): Promise<Signal | null> {
    return this.signals.findOne({ where: { id: signalId } });
  }

  async updateMetadata(
    signalId: string,
    metadata: Record<string, any>,
  ): Promise<Signal> {
    const signal = await this.signals.findOne({ where: { id: signalId } });
    if (!signal) {
      throw new Error(`Signal not found: ${signalId}`);
    }
    signal.metadata = metadata;
    return signal;
  }

  /**
   * Auto-dismisses the active signal for a source that has left the state
   * that raised it, so the inbox never shows stale items. Marked
   * `dismissedBy: system` to stay distinguishable from a user's dismissal.
   * Returns how many signals were resolved (0 when there was none).
   */
  async resolveSignal(key: SignalKey): Promise<number> {
    const result = await this.signals.update(
      { ...this.toWhere(key), status: In(ACTIVE_SIGNAL_STATUSES) },
      this.systemDismissal(),
    );
    return result.affected ?? 0;
  }

  /**
   * Bulk `resolveSignal` for producers that know the full set of sources
   * whose condition currently holds (a detector's latest run): resolves
   * every active signal of `type` whose source is no longer in that set.
   */
  async resolveStaleSignals(input: ResolveStaleSignalsInput): Promise<number> {
    const qb = this.signals
      .createQueryBuilder()
      .update(Signal)
      .set(this.systemDismissal())
      .where('organization_id = :organizationId', {
        organizationId: input.organizationId,
      })
      .andWhere('type = :type', { type: input.type })
      .andWhere('source_type = :sourceType', {
        sourceType: SIGNAL_TYPES[input.type].sourceType,
      })
      .andWhere('status IN (:...statuses)', {
        statuses: ACTIVE_SIGNAL_STATUSES,
      });

    if (input.activeSourceIds.length > 0) {
      qb.andWhere('source_id NOT IN (:...activeSourceIds)', {
        activeSourceIds: input.activeSourceIds,
      });
    }

    // Protect supplier invoice-level price increase signals from being dismissed by category-level finding scans
    if (input.type === SignalType.COST_INCREASE) {
      qb.andWhere(
        `source_id NOT IN (
          SELECT id::text FROM expense_transactions WHERE organization_id = :organizationId
        )`,
        { organizationId: input.organizationId },
      );
    }

    const result = await qb.execute();
    return result.affected ?? 0;
  }

  private toWhere(key: SignalKey) {
    return {
      organizationId: key.organizationId,
      type: key.type,
      sourceType: SIGNAL_TYPES[key.type].sourceType,
      sourceId: key.sourceId,
    };
  }

  private systemDismissal() {
    return {
      status: SignalStatus.DISMISSED,
      dismissedBy: SignalDismissedBy.SYSTEM,
      dismissedAt: new Date(),
    };
  }
}
