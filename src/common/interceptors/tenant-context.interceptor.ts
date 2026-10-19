import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { TenantContext } from '../context';
import type { AuthenticatedUser } from '../decorators';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  body: Record<string, unknown>;
}

/**
 * Intercepts incoming HTTP requests and binds the active tenant context
 * to Node.js AsyncLocalStorage.
 *
 * Resolves the target tenant ID from:
 * 1. 'X-Tenant-Id' HTTP Header
 * 2. Query param 'organizationId'
 * 3. Body param 'organizationId'
 * 4. Fallback to AuthenticatedUser.organizationId
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;

    if (!user) {
      return next.handle();
    }

    const headerVal = req.headers['x-tenant-id'];
    const headerTenant = Array.isArray(headerVal) ? headerVal[0] : headerVal;
    const queryOrg = req.query?.organizationId;
    const queryTenant = typeof queryOrg === 'string' ? queryOrg : undefined;
    const bodyOrg = req.body?.organizationId;
    const bodyTenant = typeof bodyOrg === 'string' ? bodyOrg : undefined;

    const tenantId =
      (typeof headerTenant === 'string' && headerTenant.length > 0
        ? headerTenant
        : undefined) ??
      queryTenant ??
      bodyTenant ??
      user.organizationId ??
      undefined;

    if (!tenantId) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      TenantContext.run(
        {
          userId: user.id,
          organizationId: tenantId,
          role: user.role,
          isPlatformAdmin: user.role === 'admin',
        },
        () => {
          next.handle().subscribe(subscriber);
        },
      );
    });
  }
}
