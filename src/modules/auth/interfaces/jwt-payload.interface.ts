import type { UserRole } from '@modules/users/entities/user.entity';

/** Claims embedded in both the access and the refresh JWT. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
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
