import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization } from '@common/utils';
import { UserRole } from '@modules/users/entities';

/**
 * Same rule the analytics services apply (own organization only, unless
 * admin), for AI code that must reject a request *before* building tools or
 * calling the model.
 */
export function assertCanAccessOrganization(
  currentUser: AuthenticatedUser,
  organizationId: string,
): void {
  if (currentUser.role !== (UserRole.ADMIN as string)) {
    assertOwnOrganization(currentUser.organizationId, organizationId);
  }
}
