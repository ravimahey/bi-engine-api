import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@common/entities';
import { Organization } from '@modules/organizations/entities';
import { User } from '@modules/users/entities';

export enum SupportRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  /** An approved request the org's owner later revoked — the requester has been unlinked from the organization. */
  REVOKED = 'revoked',
}

/**
 * One row per support user's request to access one organization. The org's
 * owner (the `UserRole.OWNER` user linked to it) approves or rejects it —
 * approving links the requester to the organization via the same
 * `User.organizationId` an owner already uses, so every existing
 * org-scoped read endpoint works for them with no changes. An organization
 * can have several APPROVED support users at once (its "team"); the owner
 * can revoke any one of them individually, which flips that row to
 * REVOKED and unlinks the requester's `organizationId`.
 *
 * "At most one PENDING row per (requester, organization)" is enforced by a
 * partial unique index created as raw SQL in `AddSupportRequests` —
 * TypeORM's `@Index` can't express a `WHERE` clause, so it isn't declared
 * here as a decorator. (The former "at most one APPROVED row per
 * organization" index was dropped in `AllowMultipleSupportUsersPerOrg`.)
 */
@Entity({ name: 'support_requests' })
export class SupportRequest extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Index('idx_support_requests_requester_id')
  @Column({ type: 'uuid', name: 'requester_id' })
  requesterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

  @ApiProperty({ format: 'uuid' })
  @Index('idx_support_requests_organization_id')
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ApiProperty({ enum: SupportRequestStatus })
  @Index('idx_support_requests_status')
  @Column({
    type: 'enum',
    enum: SupportRequestStatus,
    default: SupportRequestStatus.PENDING,
  })
  status: SupportRequestStatus;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Column({ type: 'uuid', name: 'reviewed_by_id', nullable: true })
  reviewedById: string | null;

  /** The owner who approved/rejected this — `SET NULL` so history survives their account being removed. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewedBy: User | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewedAt: Date | null;
}
