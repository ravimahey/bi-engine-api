import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { ACTIVE_SIGNAL_STATUSES } from '../constants';
import { QuerySignalsDto, SignalCountDto } from '../dto';
import { Signal, SignalDismissedBy, SignalStatus } from '../entities';
import type { SignalFeedPage } from '../types';
import {
  decodeSignalCursor,
  encodeSignalCursor,
  signalCursorTimestampSql,
} from '../utils';

const CURSOR_COLUMN = 'cursor_created_at';

/**
 * The user-facing side of Signals: reading the inbox and changing a
 * signal's notification state. Every method is scoped to the caller's own
 * organization (off their JWT) — there is no way to name another tenant.
 * Raising/resolving signals is `SignalsService`'s job, not this one's.
 */
@Injectable()
export class SignalsFeedService {
  constructor(
    @InjectRepository(Signal)
    private readonly signals: Repository<Signal>,
  ) {}

  /**
   * Newest first, keyset-paginated on (`created_at`, `id`) — stable while
   * new signals keep arriving at the top, unlike page/offset.
   */
  async list(
    user: AuthenticatedUser,
    query: QuerySignalsDto,
  ): Promise<SignalFeedPage> {
    const organizationId = this.requireOrganization(user);

    const qb = this.signals
      .createQueryBuilder('signal')
      .addSelect(signalCursorTimestampSql('signal'), CURSOR_COLUMN)
      .where('signal.organizationId = :organizationId', { organizationId });

    if (query.status?.length) {
      qb.andWhere('signal.status IN (:...statuses)', {
        statuses: query.status,
      });
    }
    if (query.type?.length) {
      qb.andWhere('signal.type IN (:...types)', { types: query.type });
    }
    if (query.severity?.length) {
      qb.andWhere('signal.severity IN (:...severities)', {
        severities: query.severity,
      });
    }
    if (query.from) {
      qb.andWhere('signal.createdAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('signal.createdAt <= :to', { to: query.to });
    }
    if (query.cursor) {
      const cursor = decodeSignalCursor(query.cursor);
      qb.andWhere(
        '(signal.createdAt, signal.id) < (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))',
        { cursorCreatedAt: cursor.createdAt, cursorId: cursor.id },
      );
    }

    // One extra row tells us whether another page exists without a COUNT.
    const { entities, raw } = await qb
      .orderBy('signal.createdAt', 'DESC')
      .addOrderBy('signal.id', 'DESC')
      .limit(query.limit + 1)
      .getRawAndEntities<Record<string, string>>();

    const hasMore = entities.length > query.limit;
    const items = hasMore ? entities.slice(0, query.limit) : entities;
    const last = items.length - 1;

    return {
      items,
      nextCursor: hasMore
        ? encodeSignalCursor({
            createdAt: raw[last][CURSOR_COLUMN],
            id: items[last].id,
          })
        : null,
    };
  }

  async countUnread(user: AuthenticatedUser): Promise<SignalCountDto> {
    const organizationId = this.requireOrganization(user);
    const unread = await this.signals.count({
      where: { organizationId, status: SignalStatus.UNREAD },
    });
    return { unread };
  }

  /**
   * Marks one signal read or dismisses it. Both are idempotent; the only
   * refused move is reading a dismissed signal, which would silently put it
   * back in the inbox.
   */
  async updateStatus(
    user: AuthenticatedUser,
    id: string,
    status: SignalStatus.READ | SignalStatus.DISMISSED,
  ): Promise<Signal> {
    const organizationId = this.requireOrganization(user);
    const signal = await this.findOwned(id, organizationId);

    if (signal.status === status) return signal;
    if (signal.status === SignalStatus.DISMISSED) {
      throw new ConflictException('This signal has already been dismissed');
    }

    const now = new Date();
    // Guarded on the status we just read, so a concurrent system resolve wins cleanly.
    await this.signals.update(
      { id, organizationId, status: In(ACTIVE_SIGNAL_STATUSES) },
      status === SignalStatus.READ
        ? { status, readAt: now }
        : { status, dismissedBy: SignalDismissedBy.USER, dismissedAt: now },
    );

    return this.findOwned(id, organizationId);
  }

  /** A signal from another organization is reported as missing, never as forbidden. */
  private async findOwned(id: string, organizationId: string): Promise<Signal> {
    const signal = await this.signals.findOne({
      where: { id, organizationId },
    });
    if (!signal) {
      throw new NotFoundException(`Signal "${id}" was not found`);
    }
    return signal;
  }

  private requireOrganization(user: AuthenticatedUser): string {
    if (!user.organizationId) {
      throw new ForbiddenException(
        'You do not belong to an organization yet — create or join one first',
      );
    }
    return user.organizationId;
  }
}
