import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Refresh tokens and OTPs are high-entropy/rate-limited secrets, so a fast
 * SHA-256 digest (rather than scrypt/bcrypt) is enough — the point is never
 * storing them raw, not slowing down an offline brute force.
 */
export const hashSecret = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

export const secretsMatch = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};
