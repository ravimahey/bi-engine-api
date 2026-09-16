import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { REFRESH_TOKEN_COOKIE } from '@common/constants';
import { getAppConfig } from '@common/utils';
import type { JwtPayload, RefreshPrincipal } from '../types';

const extractRefreshCookie = (req: Request): string | null =>
  (req?.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined) ?? null;

/**
 * Registered as 'jwt-refresh' — activated by JwtRefreshGuard. Refresh tokens
 * are cookie-only (never accepted from a header) so they can't be lifted out
 * of a browser via a script the way a bearer token could.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService) {
    const { auth } = getAppConfig(configService);

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractRefreshCookie]),
      ignoreExpiration: false,
      secretOrKey: auth.refreshSecret,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload): RefreshPrincipal {
    const refreshToken = extractRefreshCookie(req);
    if (!payload?.sub || !refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
      refreshToken,
    };
  }
}
