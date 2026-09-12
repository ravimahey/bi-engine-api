import { Exclude } from 'class-transformer';
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@common/entities';

/**
 * One row per connected QuickBooks company (Intuit "realm"). Single-tenant
 * for now — the app connects to one company at a time — but keying by
 * `realmId` means adding a second connection later is a query change, not a
 * schema change.
 *
 * Tokens are the only secrets here; `select: false` + `@Exclude()` is the
 * same double guard this codebase uses for `User.passwordHash` and
 * `User.hashedRefreshToken` — they never come back from a default query and
 * never get serialized to a client even if explicitly selected.
 */
@Entity({ name: 'quickbooks_connections' })
export class QuickbooksConnection extends BaseEntity {
  @Index('idx_quickbooks_connections_realm_id', { unique: true })
  @Column({ type: 'varchar', length: 100, name: 'realm_id', unique: true })
  realmId: string;

  @Exclude()
  @Column({ type: 'text', name: 'access_token', select: false })
  accessToken: string;

  @Exclude()
  @Column({ type: 'text', name: 'refresh_token', select: false })
  refreshToken: string;

  @Column({ type: 'timestamptz', name: 'access_token_expires_at' })
  accessTokenExpiresAt: Date;

  @Column({ type: 'timestamptz', name: 'refresh_token_expires_at' })
  refreshTokenExpiresAt: Date;
}
