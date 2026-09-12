import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Long enough to get through the Intuit consent screen, short enough that a
// captured redirect URL is useless shortly after.
const STATE_TTL_MS = 10 * 60 * 1000;

const sign = (payload: string, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('base64url');

/**
 * Builds an opaque, tamper-evident `state` value for the QuickBooks OAuth
 * `authorizeUri` call: a random nonce plus an expiry, HMAC-signed with the
 * app's QuickBooks client secret. Nothing is stored server-side — the
 * callback leg re-derives the signature and rejects anything that doesn't
 * match, which is what actually stops CSRF here (a static, hardcoded state
 * value does not).
 */
export const buildQuickbooksState = (secret: string): string => {
  const nonce = randomBytes(16).toString('base64url');
  const expiresAt = Date.now() + STATE_TTL_MS;
  const payload = `${nonce}.${expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
};

/** Verifies a `state` value round-tripped from Intuit: valid signature, not expired. */
export const isValidQuickbooksState = (
  state: unknown,
  secret: string,
): boolean => {
  if (typeof state !== 'string') return false;

  const [nonce, expiresAtRaw, signature] = state.split('.');
  if (!nonce || !expiresAtRaw || !signature) return false;

  const expected = sign(`${nonce}.${expiresAtRaw}`, secret);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);

  const signatureMatches =
    expectedBuf.length === actualBuf.length &&
    timingSafeEqual(expectedBuf, actualBuf);
  if (!signatureMatches) return false;

  const expiresAt = Number(expiresAtRaw);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
};
