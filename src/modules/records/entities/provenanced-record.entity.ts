import { ApiProperty } from '@nestjs/swagger';
import { Column, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ProviderConnection } from '@modules/providers/entities';
import { TenantScopedEntity } from './tenant-scoped.entity';
import { SourceSystem } from './source-system.enum';

/**
 * Shared provenance columns for every header-level records/* entity: which
 * origin produced this row, and which `provider_connections` row it synced
 * through. `sourceConnectionId` is a real FK into the shared `providers`
 * module — never into a provider-specific table — so this stays
 * provider-agnostic per the two-layer split; it's nullable because
 * manual/CSV rows have no connection at all.
 *
 * `@Index`/`@Column` declared here are applied per concrete subclass table
 * by TypeORM's entity-inheritance metadata, so the seven records/* entities
 * that extend this don't each repeat the same four columns and the same
 * uniqueness rule.
 */
@Index(['organizationId', 'sourceSystem', 'sourceExternalId'], {
  unique: true,
})
export abstract class ProvenancedRecordEntity extends TenantScopedEntity {
  @ApiProperty({ enum: SourceSystem })
  @Column({ type: 'enum', enum: SourceSystem, name: 'source_system' })
  sourceSystem: SourceSystem;

  /** The originating system's own id for this record — always a string, never assumed numeric. */
  @ApiProperty({ example: '46' })
  @Column({ type: 'varchar', length: 100, name: 'source_external_id' })
  sourceExternalId: string;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Index()
  @Column({ type: 'uuid', name: 'source_connection_id', nullable: true })
  sourceConnectionId: string | null;

  @ManyToOne(() => ProviderConnection, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'source_connection_id' })
  sourceConnection: ProviderConnection | null;
}
