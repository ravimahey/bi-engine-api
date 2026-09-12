import type { FindOptionsSelect } from 'typeorm';
import type { User } from '../entities';

/** Fields hidden by `select: false` that auth flows need to see explicitly. */
export const SECRET_FIELDS: FindOptionsSelect<User> = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  googleId: true,
  passwordHash: true,
  hashedRefreshToken: true,
  resetPasswordOtp: true,
  resetPasswordOtpExpiresAt: true,
};
