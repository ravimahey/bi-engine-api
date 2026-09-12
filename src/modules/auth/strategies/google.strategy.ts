import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import {
  Strategy,
  type Profile,
  type VerifyCallback,
} from 'passport-google-oauth20';
import { getAppConfig } from '@common/utils';
import type { GoogleProfile } from '../types';
import { parseGoogleState } from '../utils';

/** Registered as 'google' — activated by GoogleOauthGuard on both leg of the OAuth flow. */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    const { auth } = getAppConfig(configService);

    super({
      clientID: auth.googleClientId,
      clientSecret: auth.googleClientSecret,
      callbackURL: auth.googleCallbackUrl,
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Google account has no email on file'), undefined);
      return;
    }

    const googleProfile: GoogleProfile = {
      email: email.toLowerCase(),
      firstName: profile.name?.givenName ?? profile.displayName ?? 'User',
      lastName: profile.name?.familyName ?? '',
      googleId: profile.id,
      requestedRole: parseGoogleState(req.query?.state),
    };

    done(null, googleProfile);
  }
}
