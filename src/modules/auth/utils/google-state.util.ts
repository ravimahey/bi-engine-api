import { UserRole } from '@modules/users/entities/user.entity';
import { SELF_SERVICE_ROLES } from '../dto/signup.dto';

/**
 * The only data carried through Google's OAuth `state` round trip: which role
 * a brand-new account should get. Base64url JSON keeps it opaque and
 * URL-safe without pulling in a signing dependency — it never carries
 * anything sensitive, so tamper-resistance isn't a requirement here.
 */
export const buildGoogleState = (role: unknown): string => {
  const safeRole = SELF_SERVICE_ROLES.includes(role as never)
    ? role
    : UserRole.BUYER;
  return Buffer.from(JSON.stringify({ role: safeRole })).toString('base64url');
};

export const parseGoogleState = (state: unknown): UserRole => {
  if (typeof state !== 'string' || !state) return UserRole.BUYER;

  try {
    const decoded = JSON.parse(
      Buffer.from(state, 'base64url').toString('utf8'),
    ) as {
      role?: unknown;
    };
    return SELF_SERVICE_ROLES.includes(decoded.role as never)
      ? (decoded.role as UserRole)
      : UserRole.BUYER;
  } catch {
    return UserRole.BUYER;
  }
};
