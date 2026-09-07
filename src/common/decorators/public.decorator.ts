import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../constants/app.constants';

/**
 * Marks a route as unauthenticated. Read via `Reflector` inside an auth guard:
 *
 *   const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
 *     context.getHandler(), context.getClass(),
 *   ]);
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
