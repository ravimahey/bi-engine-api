import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@common/entities';
import { User } from '@modules/users/entities';

export enum WalkthroughStatus {
  /** Started (or resumed) but not finished — `currentStep` says where to pick up. */
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  /** The user dismissed the tour — never auto-start it again. */
  SKIPPED = 'skipped',
}

/**
 * One row per (user, tour): how far a user got through one guided
 * walkthrough. A missing `onboarding:*` row is what tells the frontend
 * "first sign-in — start the tour", so no flag lives on `users` itself.
 * Unique on (`user_id`, `tour_key`) so progress updates are upserts.
 */
@Entity({ name: 'user_walkthroughs' })
@Index('idx_user_walkthroughs_user_tour', ['userId', 'tourKey'], {
  unique: true,
})
export class UserWalkthrough extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ApiProperty({ example: 'onboarding:supplier' })
  @Column({ type: 'varchar', length: 100, name: 'tour_key' })
  tourKey: string;

  @ApiProperty({ enum: WalkthroughStatus })
  @Column({
    type: 'enum',
    enum: WalkthroughStatus,
    default: WalkthroughStatus.IN_PROGRESS,
  })
  status: WalkthroughStatus;

  @ApiProperty({ example: 3 })
  @Column({ type: 'integer', name: 'current_step', default: 0 })
  currentStep: number;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;
}
