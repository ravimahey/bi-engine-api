import { createParamDecorator } from '@nestjs/common';
import { TenantContext } from '../context';

/**
 * Injects the validated active tenant ID from the current request's TenantContext.
 * Usage in controllers:
 *   findTransactions(@TenantId() tenantId: string) {}
 */
export const TenantId = createParamDecorator((): string => {
  return TenantContext.requireTenantId();
});
