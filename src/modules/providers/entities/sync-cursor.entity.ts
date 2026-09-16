import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@common/entities';
import { ProviderConnection } from './provider-connection.entity';

/**
 * Per-connection, per-entity-type incremental-sync checkpoint — provider
 * agnostic on purpose. For QuickBooks, `entityType` is a CDC entity name
 * ("Vendor", "Bill", ...) and `cursor` is the `changedSince` ISO timestamp
 * passed to `/cdc?...&changedSince=`; a future Xero connector reuses this
 * same table with its own entity-type strings and its own cursor format
 * (many APIs use an opaque page/cursor token rather than a timestamp) —
 * this module doesn't need to know which.
 */
@Entity({ name: 'sync_cursors' })
@Index(
  'idx_sync_cursors_connection_entity',
  ['providerConnectionId', 'entityType'],
  {
    unique: true,
  },
)
export class SyncCursor extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', name: 'provider_connection_id' })
  providerConnectionId: string;

  @ManyToOne(() => ProviderConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'provider_connection_id' })
  providerConnection: ProviderConnection;

  @ApiProperty({ example: 'Bill' })
  @Column({ type: 'varchar', length: 100, name: 'entity_type' })
  entityType: string;

  /** Opaque to this module: an ISO changedSince timestamp today, a page token tomorrow. */
  @ApiProperty({ example: '2026-09-12T00:00:00Z' })
  @Column({ type: 'varchar', length: 255, name: 'cursor' })
  cursor: string;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', name: 'last_synced_at', nullable: true })
  lastSyncedAt: Date | null;
}
