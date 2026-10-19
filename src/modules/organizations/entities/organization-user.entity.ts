import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@common/entities';
import { User } from '@modules/users/entities';
import { Organization } from './organization.entity';

export enum OrganizationRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  ANALYST = 'analyst',
  VIEWER = 'viewer',
}

export enum OrganizationUserStatus {
  ACTIVE = 'active',
  INVITED = 'invited',
  SUSPENDED = 'suspended',
}

/**
 * Tenant membership junction entity (M:N User to Organization).
 * Decouples global user identities from individual organizations,
 * allowing users (accountants, multi-location operators, consultants)
 * to belong to multiple tenants with distinct roles per tenant.
 */
@Entity({ name: 'organization_users' })
@Index('idx_org_users_org_user', ['organizationId', 'userId'], { unique: true })
@Index('idx_org_users_user_status', ['userId', 'status'])
@Index('idx_org_users_org_role', ['organizationId', 'role'])
export class OrganizationUser extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, (organization) => organization.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.organizationMemberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ApiProperty({ enum: OrganizationRole, example: OrganizationRole.OWNER })
  @Column({
    type: 'enum',
    enum: OrganizationRole,
    enumName: 'organization_role_enum',
    default: OrganizationRole.VIEWER,
  })
  role: OrganizationRole;

  @ApiProperty({
    enum: OrganizationUserStatus,
    example: OrganizationUserStatus.ACTIVE,
  })
  @Column({
    type: 'enum',
    enum: OrganizationUserStatus,
    enumName: 'organization_user_status_enum',
    name: 'status',
    default: OrganizationUserStatus.ACTIVE,
  })
  status: OrganizationUserStatus;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Column({ type: 'uuid', name: 'invited_by_id', nullable: true })
  invitedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invited_by_id' })
  invitedBy: User | null;
}
