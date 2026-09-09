import type { UserRole } from '@modules/users/entities/user.entity';

/** Claims embedded in both the access and the refresh JWT. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
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
