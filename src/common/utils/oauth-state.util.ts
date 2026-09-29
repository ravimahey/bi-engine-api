import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Long enough to get through a provider's consent screen, short enough that
// a captured redirect URL is useless shortly after.
const STATE_TTL_MS = 10 * 60 * 1000;

const sign = (payload: string, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('base64url');

/** What a valid, unexpired OAuth `state` value proves once verified. */
export interface OAuthStateClaims {
  /** The organization that started this OAuth flow via `/<provider>/connect` — carried securely through the provider's redirect round trip. */
  organizationId: string;
}

/**
 * Builds an opaque, tamper-evident OAuth `state` value: a random nonce, an
 * expiry, and the initiating `organizationId`, all HMAC-signed with a secret
 * already scoped to that provider integration (its client secret). Nothing
 * is stored server-side — the callback leg re-derives the signature via
 * `parseOAuthState` and rejects anything that doesn't match, which is what
 * actually stops CSRF here (a static, hardcoded state value does not) and is
 * also what lets the callback know which organization this connection
 * belongs to without trusting an unsigned, caller-suppliable value. Shared
 * by every provider module's OAuth flow (QuickBooks, Xero).
 */
export const buildOAuthState = (
  secret: string,
  organizationId: string,
): string => {
  const nonce = randomBytes(16).toString('base64url');
  const expiresAt = Date.now() + STATE_TTL_MS;
  const payload = `${nonce}.${expiresAt}.${organizationId}`;
  return `${payload}.${sign(payload, secret)}`;
};

/**
 * Verifies a `state` value round-tripped from a provider — signature
 * matches, not expired, well-formed — and returns the `organizationId` it
 * was signed with, or `null` if the state is missing, malformed, tampered
 * with, or expired. Signature and claims are verified together in one pass
 * so a caller can never act on an `organizationId` that wasn't part of what
 * was actually signed.
 */
export const parseOAuthState = (
  state: unknown,
  secret: string,
): OAuthStateClaims | null => {
  if (typeof state !== 'string') return null;

  const parts = state.split('.');
  if (parts.length !== 4) return null;
  const [nonce, expiresAtRaw, organizationId, signature] = parts;
  if (!nonce || !expiresAtRaw || !organizationId || !signature) return null;

  const expected = sign(`${nonce}.${expiresAtRaw}.${organizationId}`, secret);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);

  const signatureMatches =
    expectedBuf.length === actualBuf.length &&
    timingSafeEqual(expectedBuf, actualBuf);
  if (!signatureMatches) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return null;

  return { organizationId };
};
