import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { buildGoogleState } from '../utils/google-state.util';

/**
 * Only for the route that *starts* the Google flow. Encodes the requested
 * signup role into the OAuth `state` param so it survives the redirect round
 * trip; `GoogleOauthGuard` (common/guards) handles the plain callback leg.
 */
@Injectable()
export class GoogleInitGuard extends AuthGuard('google') {
  override getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    return { state: buildGoogleState(req.query?.role) };
  }
}
