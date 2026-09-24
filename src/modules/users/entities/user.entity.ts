import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@common/entities';
import { Organization } from '@modules/organizations/entities';

export enum UserRole {
  ADMIN = 'admin',
  SUPPLIER = 'supplier',
  BUYER = 'buyer',
  /**
   * Full access, same as buyer/supplier, scoped to exactly one organization
   * once an owner approves their access request (see `modules/support`).
   * Never self-serves an organization the way buyer/supplier do — it must
   * be requested and approved.
   */
  SUPPORT = 'support',
}

@Entity({ name: 'users' })
export class User extends BaseEntity {
  @ApiProperty({ example: 'ada@example.com' })
  @Index('idx_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @ApiProperty({ example: 'Ada' })
  @Column({ type: 'varchar', length: 100, name: 'first_name' })
  firstName: string;

  @ApiProperty({ example: 'Lovelace' })
  @Column({ type: 'varchar', length: 100, name: 'last_name' })
  lastName: string;

  /**
   * `select: false` keeps the hash out of every default query; `@Exclude()` is a
   * second guard in case it is explicitly selected (e.g. for login).
   * Nullable because Google-only accounts never set a password.
   */
  @Exclude()
  @Column({
    type: 'varchar',
    length: 255,
    name: 'password_hash',
    nullable: true,
    select: false,
  })
  passwordHash: string | null;

  @ApiProperty({ enum: UserRole, example: UserRole.BUYER })
  @Column({ type: 'enum', enum: UserRole, default: UserRole.BUYER })
  role: UserRole;

  /**
   * Null until this user creates or joins an organization — signup and
   * organization creation are deliberately separate steps (see
   * `OrganizationsService.create`). `SET NULL` rather than `CASCADE`: an
   * organization being deactivated/deleted should never take the user
   * account down with it.
   */
  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Index('idx_users_organization_id')
  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization | null;

  @ApiProperty({ example: true })
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', name: 'last_login_at', nullable: true })
  lastLoginAt: Date | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({
    type: 'varchar',
    length: 255,
    name: 'google_id',
    nullable: true,
    unique: true,
  })
  googleId: string | null;

  @Exclude()
  @Column({
    type: 'varchar',
    length: 255,
    name: 'hashed_refresh_token',
    nullable: true,
    select: false,
  })
  hashedRefreshToken: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({
    type: 'varchar',
    length: 500,
    name: 'avatar_url',
    nullable: true,
  })
  avatarUrl: string | null;

  /** Cloudinary public id backing `avatarUrl` — needed to replace/delete the asset later. */
  @Exclude()
  @Column({
    type: 'varchar',
    length: 255,
    name: 'avatar_public_id',
    nullable: true,
    select: false,
  })
  avatarPublicId: string | null;

  @Exclude()
  @Column({
    type: 'varchar',
    length: 255,
    name: 'reset_password_otp',
    nullable: true,
    select: false,
  })
  resetPasswordOtp: string | null;

  @Exclude()
  @Column({
    type: 'timestamptz',
    name: 'reset_password_otp_expires_at',
    nullable: true,
    select: false,
  })
  resetPasswordOtpExpiresAt: Date | null;

  @ApiProperty({ example: 'Ada Lovelace' })
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }
}
