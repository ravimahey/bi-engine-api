import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Pulls the authenticated principal (set by an auth guard/strategy) off the request.
 *
 *   findMe(@CurrentUser() user: AuthenticatedUser) {}
 *   findMyId(@CurrentUser('id') id: string) {}
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
