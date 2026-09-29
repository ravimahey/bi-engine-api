import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies Xero's `x-xero-signature` header: base64(HMAC-SHA256(raw request
 * body, webhook key)). Must be computed over the exact raw bytes Xero sent —
 * a re-serialized parsed body won't match. Constant-time comparison so the
 * check leaks nothing about how close a forged signature was. Returns
 * `false` (never throws) for a missing secret, body, or header.
 */
export function isValidXeroWebhookSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !signature || !secret) return false;

  const expected = Buffer.from(
    createHmac('sha256', secret).update(rawBody).digest('base64'),
  );
  const actual = Buffer.from(signature);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
