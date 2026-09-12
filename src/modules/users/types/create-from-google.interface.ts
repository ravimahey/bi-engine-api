import type { UserRole } from '../entities';

/** Profile fields carried in from a Google account on first Google sign-in. */
export interface CreateUserFromGoogleInput {
  email: string;
  firstName: string;
  lastName: string;
  googleId: string;
  role: UserRole;
}
