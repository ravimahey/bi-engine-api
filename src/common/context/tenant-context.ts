import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException } from '@nestjs/common';

export interface TenantContextData {
  userId: string;
  organizationId: string;
  role: string;
  isPlatformAdmin: boolean;
}

/**
 * Request-scoped Tenant Context powered by Node.js AsyncLocalStorage.
 * Preserves the active tenant identifier throughout asynchronous call chains,
 * allowing database subscribers, query runners, and downstream services
 * to access the validated tenant ID without manual parameter propagation.
 */
export class TenantContext {
  private static readonly storage = new AsyncLocalStorage<TenantContextData>();

  static run<R>(data: TenantContextData, fn: () => R): R {
    return this.storage.run(data, fn);
  }

  static get(): TenantContextData | undefined {
    return this.storage.getStore();
  }

  static getTenantId(): string | undefined {
    return this.storage.getStore()?.organizationId;
  }

  static requireTenantId(): string {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException(
        'Active tenant context is required for this operation',
      );
    }
    return tenantId;
  }
}
