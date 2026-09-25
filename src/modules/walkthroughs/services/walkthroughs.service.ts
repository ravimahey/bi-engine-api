import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WALKTHROUGH_LIST_LIMIT } from '../constants';
import { UpdateWalkthroughDto } from '../dto';
import { UserWalkthrough, WalkthroughStatus } from '../entities';

/** Per-user guided-tour progress — every method is scoped to the caller's own rows. */
@Injectable()
export class WalkthroughsService {
  constructor(
    @InjectRepository(UserWalkthrough)
    private readonly walkthroughs: Repository<UserWalkthrough>,
  ) {}

  listForUser(userId: string): Promise<UserWalkthrough[]> {
    return this.walkthroughs.find({
      where: { userId },
      select: {
        id: true,
        tourKey: true,
        status: true,
        currentStep: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      order: { createdAt: 'ASC' },
      take: WALKTHROUGH_LIST_LIMIT,
    });
  }

  /** Creates or updates the caller's progress on one tour and returns the saved row. */
  async upsert(
    userId: string,
    tourKey: string,
    dto: UpdateWalkthroughDto,
  ): Promise<UserWalkthrough> {
    const finished = dto.status !== WalkthroughStatus.IN_PROGRESS;
    await this.walkthroughs.upsert(
      {
        userId,
        tourKey,
        status: dto.status,
        currentStep: dto.currentStep ?? 0,
        completedAt: finished ? new Date() : null,
      },
      { conflictPaths: ['userId', 'tourKey'] },
    );
    return this.walkthroughs.findOneOrFail({ where: { userId, tourKey } });
  }

  /**
   * "Replay tours": forgets every tour the caller has seen, so the
   * onboarding tour auto-starts again next time. A hard delete on purpose —
   * this is disposable UI state, and a soft-deleted row would still hold
   * the (user, tour) unique slot the next upsert needs.
   */
  async resetForUser(userId: string): Promise<void> {
    await this.walkthroughs.delete({ userId });
  }
}
