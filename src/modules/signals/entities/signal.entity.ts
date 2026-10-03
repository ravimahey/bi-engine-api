import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@common/entities';
import { Organization } from '@modules/organizations/entities';

/** The v0 signal types — the full set, no others. */
export enum SignalType {
  ORDER_NEEDS_ACTION = 'order_needs_action',
  ORDER_READY_TO_PACK = 'order_ready_to_pack',
  ADJUSTMENT_REJECTED = 'adjustment_rejected',
  COST_INCREASE = 'cost_increase',
  POSSIBLE_DUPLICATE = 'possible_duplicate',
  DATA_QUALITY = 'data_quality',
  INVOICE_OVERDUE = 'invoice_overdue',
  SYNC_ERROR = 'sync_error',
}

export enum SignalSeverity {
  INFO = 'info',
  WARNING = 'warning',
  URGENT = 'urgent',
}

/** Which kind of source record `sourceId` points at — drives the UI's deep link. */
export enum SignalSourceType {
  ORDER = 'order',
  FINDING = 'finding',
  INVOICE = 'invoice',
  CONNECTION = 'connection',
}

export enum SignalStatus {
  UNREAD = 'unread',
  READ = 'read',
  DISMISSED = 'dismissed',
}

/** `system` = auto-resolved because the source left the state that raised the signal. */
export enum SignalDismissedBy {
  USER = 'user',
  SYSTEM = 'system',
}

/**
 * One row in an organization's attention inbox: "something happened that you
 * should look at", plus a pointer to the record it happened on. Signals owns
 * only the notification state (unread/read/dismissed) — never the source's
 * data, so there are deliberately no amounts, quantities or evidence columns
 * here; `message` is a short display string the producer rendered.
 *
 * `organizationId` is the recipient. At most one *active* (unread/read)
 * signal can exist per (organization, type, source) — enforced by the
 * partial unique index `idx_signals_dedup_active`, which lives in the
 * migration as raw SQL (a `WHERE` index, same as `support_requests`).
 */
@Entity({ name: 'signals' })
// Query shapes: the feed (org + status filter, newest first) and the unread count.
@Index('idx_signals_org_status_created', [
  'organizationId',
  'status',
  'createdAt',
])
export class Signal extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ApiProperty({ enum: SignalType })
  @Column({ type: 'varchar', length: 50 })
  type: SignalType;

  @ApiProperty({ enum: SignalSeverity })
  @Column({ type: 'enum', enum: SignalSeverity })
  severity: SignalSeverity;

  @ApiProperty({ example: 'Integration sync failed' })
  @Column({ type: 'varchar', length: 200 })
  title: string;

  @ApiProperty({ example: 'QuickBooks sync failed — reconnect required.' })
  @Column({ type: 'text' })
  message: string;

  @ApiProperty({ enum: SignalSourceType })
  @Column({ type: 'enum', enum: SignalSourceType, name: 'source_type' })
  sourceType: SignalSourceType;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', name: 'source_id' })
  sourceId: string;

  @ApiProperty({ enum: SignalStatus })
  @Column({ type: 'enum', enum: SignalStatus, default: SignalStatus.UNREAD })
  status: SignalStatus;

  /** Set only when `status` is `dismissed`. */
  @ApiProperty({ enum: SignalDismissedBy, required: false, nullable: true })
  @Column({
    type: 'enum',
    enum: SignalDismissedBy,
    name: 'dismissed_by',
    nullable: true,
  })
  dismissedBy: SignalDismissedBy | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', name: 'read_at', nullable: true })
  readAt: Date | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', name: 'dismissed_at', nullable: true })
  dismissedAt: Date | null;
}
