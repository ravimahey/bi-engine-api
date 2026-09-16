import type { UserRole } from '@modules/users/entities';

/** Claims embedded in both the access and the refresh JWT. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /**
   * Null until the user creates/joins an organization. Embedded the same way
   * `role` already is — accepted staleness: a still-valid token issued
   * before the user had an org won't reflect one created in another session
   * until the token is refreshed/reissued. `OrganizationsService.create`
   * re-issues a fresh session immediately after linking, so the same tab
   * picks it up without a re-login.
   */
  organizationId: string | null;
  /**
   * Random per-token nonce. Without it, two tokens signed for the same user
   * within the same second are byte-identical (JWT `iat` only has 1s
   * resolution and the rest of the payload is static) — which would let an
   * already-rotated refresh token silently "collide" with its replacement
   * instead of being rejected by the reuse check in `AuthService.refreshSession`.
   */
  jti: string;
}

/** `req.user` after the access-token strategy runs. */
export interface AuthPrincipal {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string | null;
}

/** `req.user` after the refresh-token strategy runs — carries the raw cookie
 * value so the service can compare it against the stored hash. */
export interface RefreshPrincipal extends AuthPrincipal {
  refreshToken: string;
}

/** Shape passed from the Google strategy into AuthService.loginWithGoogle(). */
export interface GoogleProfile {
  email: string;
  firstName: string;
  lastName: string;
  googleId: string;
  /** Requested role, carried through the OAuth `state` param — buyer/supplier only. */
  requestedRole: UserRole;
}
