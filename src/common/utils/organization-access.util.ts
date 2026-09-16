import { ForbiddenException } from '@nestjs/common';

/**
 * Enforces that a caller can only act on their own organization. Every
 * org-scoped endpoint (organizations, quickbooks connect/poll, records
 * filters) calls this with the caller's own `organizationId` (off their JWT)
 * against the organization they're trying to read/act on. Callers with an
 * elevated role (e.g. admin) should skip this call entirely rather than pass
 * a bypass flag through it — keeping "who's exempt" in each call site's own
 * role-aware code instead of buried in this generic utility.
 */
export function assertOwnOrganization(
  callerOrganizationId: string | null,
  targetOrganizationId: string,
): void {
  // Two distinct causes, two distinct messages — "you have none yet" and
  // "that one isn't yours" point at very different fixes (create/join an
  // organization vs. pass the right id), and collapsing them into one
  // generic message makes both much harder to diagnose from the client side.
  if (!callerOrganizationId) {
    throw new ForbiddenException(
      'You do not belong to an organization yet — create or join one first',
    );
  }

  if (callerOrganizationId !== targetOrganizationId) {
    throw new ForbiddenException(
      `You do not have access to organization "${targetOrganizationId}" — it does not match your own organization`,
    );
  }
}
