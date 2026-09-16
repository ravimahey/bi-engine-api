import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ACCESS_TOKEN_COOKIE } from '@common/constants';
import { getAppConfig } from '@common/utils';
import type { AuthPrincipal, JwtPayload } from '../types';

/**
 * Registered as 'jwt' — the strategy `JwtAuthGuard` (common/guards) activates.
 * Reads the token from the httpOnly cookie first, falling back to a bearer
 * header so Swagger / non-browser API clients keep working.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    const { auth } = getAppConfig(configService);

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request): string | null =>
          (req?.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined) ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: auth.accessSecret,
    });
  }

  validate(payload: JwtPayload): AuthPrincipal {
    if (!payload?.sub) throw new UnauthorizedException('Invalid access token');
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
    };
  }
}
