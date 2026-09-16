import type { AuthTokens } from '@modules/auth/types';
import type { Organization } from '../entities';

/**
 * Result of `OrganizationsService.create`. `tokens` is only set when the
 * caller self-linked to the organization they just created (a fresh
 * session carrying the new `organizationId` claim) — an admin creating a
 * standalone organization on someone else's behalf doesn't change their own
 * session, so `tokens` stays undefined for that path.
 */
export interface CreateOrganizationResult {
  organization: Organization;
  tokens?: AuthTokens;
}
