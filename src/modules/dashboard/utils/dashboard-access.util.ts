import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization } from '@common/utils';
import { UserRole } from '@modules/users/entities';

/** Admins may read any organization; everyone else only their own. */
export function assertDashboardAccess(
  organizationId: string,
  currentUser: AuthenticatedUser,
): void {
  if (currentUser.role !== (UserRole.ADMIN as string)) {
    assertOwnOrganization(currentUser.organizationId, organizationId);
  }
}
