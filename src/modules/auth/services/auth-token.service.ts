import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { getAppConfig } from '@common/utils';
import { User } from '@modules/users/entities';
import { UserCredentialsService, UsersService } from '@modules/users/services';
import { AUTH_ERROR_MESSAGES } from '../constants';
import type { AuthResult, AuthTokens } from '../types';
import { hashSecret, secretsMatch } from '../utils';

/**
 * Session/token lifecycle split out of `AuthService`: issuing the
 * access/refresh pair, rotating it on `/refresh`, and revoking it on
 * logout. `AuthService` delegates here instead of owning tokens itself.
 */
@Injectable()
export class AuthTokenService {
  constructor(
    private readonly usersService: UsersService,
    private readonly userCredentialsService: UserCredentialsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async startSession(user: User): Promise<AuthResult> {
    const tokens = this.issueTokens(user);
    await this.userCredentialsService.setRefreshToken(
      user.id,
      hashSecret(tokens.refreshToken),
    );
    await this.userCredentialsService.updateLastLoginAt(user.id);
    return { user, tokens };
  }

  /**
   * Rotates the refresh token: the presented one must match the single hash
   * on file. A mismatch — an already-used or forged token — clears the
   * stored hash so a stolen token can't be replayed again, and forces the
   * legitimate user to log back in.
   */
  async refreshSession(
    userId: string,
    presentedRefreshToken: string,
  ): Promise<AuthResult> {
    const user = await this.usersService.findByIdWithSecret(userId);
    const sessionExpired = () =>
      new UnauthorizedException(AUTH_ERROR_MESSAGES.SESSION_EXPIRED);

    if (!user || !user.hashedRefreshToken) throw sessionExpired();

    const matches = secretsMatch(
      hashSecret(presentedRefreshToken),
      user.hashedRefreshToken,
    );
    if (!matches) {
      await this.userCredentialsService.removeRefreshToken(user.id);
      throw sessionExpired();
    }
    if (!user.isActive) {
      throw new ForbiddenException(AUTH_ERROR_MESSAGES.ACCOUNT_DEACTIVATED);
    }

    return this.startSession(user);
  }

  async logout(userId: string): Promise<void> {
    await this.userCredentialsService.removeRefreshToken(userId);
  }

  private issueTokens(
    user: Pick<User, 'id' | 'email' | 'role' | 'organizationId'>,
  ): AuthTokens {
    const { auth } = getAppConfig(this.configService);
    const claims = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };

    const accessToken = this.jwtService.sign(
      { ...claims, jti: randomUUID() },
      {
        secret: auth.accessSecret,
        // JWT_*_EXPIRES_IN is a validated env string ('15m', '7d', ...); the
        // narrower `StringValue` template type can't be inferred from `string`.
        expiresIn: auth.accessExpiresIn as JwtSignOptions['expiresIn'],
      },
    );
    // A fresh jti on every issuance guarantees the refresh token is unique
    // even when re-issued within the same iat second — see JwtPayload.jti.
    const refreshToken = this.jwtService.sign(
      { ...claims, jti: randomUUID() },
      {
        secret: auth.refreshSecret,
        expiresIn: auth.refreshExpiresIn as JwtSignOptions['expiresIn'],
      },
    );

    return { accessToken, refreshToken };
  }
}
