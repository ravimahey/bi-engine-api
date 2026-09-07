import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';

export enum UserRole {
  ADMIN = 'admin',
  SUPPLIER = 'supplier',
  BUYER = 'buyer',
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
   */
  @Exclude()
  @Column({
    type: 'varchar',
    length: 255,
    name: 'password_hash',
    select: false,
  })
  passwordHash: string;

  @ApiProperty({ enum: UserRole, example: UserRole.VIEWER })
  @Column({ type: 'enum', enum: UserRole, default: UserRole.VIEWER })
  role: UserRole;

  @ApiProperty({ example: true })
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', name: 'last_login_at', nullable: true })
  lastLoginAt: Date | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'varchar', length: 255, name: 'google_id', nullable: true, unique: true })
  googleId: string | null;

  @Exclude()
  @Column({ type: 'varchar', length: 255, name: 'hashed_refresh_token', nullable: true, select: false })
  hashedRefreshToken: string | null;

  @Exclude()
  @Column({ type: 'varchar', length: 255, name: 'reset_password_otp', nullable: true, select: false })
  resetPasswordOtp: string | null;

  @Exclude()
  @Column({ type: 'timestamptz', name: 'reset_password_otp_expires_at', nullable: true, select: false })
  resetPasswordOtpExpiresAt: Date | null;

  @ApiProperty({ example: 'Ada Lovelace' })
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }
}
