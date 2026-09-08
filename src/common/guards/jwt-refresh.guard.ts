import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Validates the refresh_token cookie against the 'jwt-refresh' strategy. */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
