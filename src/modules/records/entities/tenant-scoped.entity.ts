import { ApiProperty } from '@nestjs/swagger';
import { Column, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@common/entities';
import { Organization } from '@modules/organizations/entities';

/** Adds the tenant-isolation column every records/* table (headers and lines alike) needs. */
export abstract class TenantScopedEntity extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Index()
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;
}
