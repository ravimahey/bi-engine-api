import type { User } from '@modules/users/entities';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Every method that ends a request cycle successfully returns this pair; the
 * controller is the only place that touches cookies — the auth services
 * never know about Express Request/Response.
 */
export interface AuthResult {
  user: User;
  tokens: AuthTokens;
}
