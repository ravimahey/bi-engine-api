import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { getAppConfig } from '@common/utils';
import { AUTH_ERROR_MESSAGES } from '../constants';
import type { VerifiedGoogleIdentity } from '../types';

/**
 * Verifies a Google ID token (signature, issuer, expiry and audience =
 * `GOOGLE_CLIENT_ID`) and returns the trusted identity inside it. Knows
 * nothing about users or sessions — `AuthService` decides what to do with it.
 */
@Injectable()
export class GoogleTokenVerifierService {
  private readonly logger = new Logger(GoogleTokenVerifierService.name);
  private readonly client = new OAuth2Client();
  private readonly audience: string;

  constructor(configService: ConfigService) {
    this.audience = getAppConfig(configService).auth.googleClientId;
  }

  async verify(idToken: string): Promise<VerifiedGoogleIdentity> {
    let payload: TokenPayload | undefined;

    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audience,
      });
      payload = ticket.getPayload();
    } catch (error) {
      this.logger.warn(`Google ID token rejected: ${(error as Error).message}`);
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.INVALID_GOOGLE_TOKEN);
    }

    // Accounts are auto-linked by email, so an unverified email must never
    // get through — it would allow taking over someone else's account.
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      this.logger.warn('Google ID token rejected: missing or unverified email');
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.INVALID_GOOGLE_TOKEN);
    }

    return {
      email: payload.email.toLowerCase(),
      firstName: payload.given_name ?? payload.name ?? 'User',
      lastName: payload.family_name ?? '',
      googleId: payload.sub,
    };
  }
}
