import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { ACTIVE_SIGNAL_STATUSES, SIGNAL_TYPES } from '../constants';
import { Signal, SignalDismissedBy, SignalStatus } from '../entities';
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
    options: CreateSignalOptions = {},
  ): Promise<Signal | null> {
    const definition = SIGNAL_TYPES[input.type];
    if (!definition) {
      throw new Error(`Unknown signal type "${String(input.type)}"`);
    }
    if (!input.message.trim()) {
      throw new Error(`Signal "${input.type}" needs a message`);
    }

    const key = this.toWhere(input);

    if (
      options.skipIfUserDismissed &&
      (await this.signals.exists({
        where: {
          ...key,
          status: SignalStatus.DISMISSED,
          dismissedBy: SignalDismissedBy.USER,
        },
      }))
    ) {
      return null;
    }

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

    // Postgres returns the inserted row's generated columns — none on a conflict.
    if ((result.raw as unknown[]).length > 0) {
      this.logger.log(
        `Created ${input.type} signal for org ${input.organizationId} (source ${input.sourceId})`,
      );
    }

    const existing = await this.signals.findOne({
      where: { ...key, status: In(ACTIVE_SIGNAL_STATUSES) },
    });

    if (existing) {
      const newTitle = input.title?.trim() || definition.title;
      const newMessage = input.message.trim();
      if (existing.title !== newTitle || existing.message !== newMessage) {
        existing.title = newTitle;
        existing.message = newMessage;
        await this.signals.update(existing.id, {
          title: newTitle,
          message: newMessage,
          createdAt: new Date(),
        });
      }
      if (input.metadata) {
        existing.metadata = input.metadata;
      }
    }

    return existing;
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
    const result = await this.signals.update(
      {
        organizationId: input.organizationId,
        type: input.type,
        sourceType: SIGNAL_TYPES[input.type].sourceType,
        status: In(ACTIVE_SIGNAL_STATUSES),
        ...(input.activeSourceIds.length > 0
          ? { sourceId: Not(In(input.activeSourceIds)) }
          : {}),
      },
      this.systemDismissal(),
    );
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
