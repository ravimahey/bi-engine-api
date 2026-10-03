import { createHash } from 'node:crypto';

/** Fixed namespace for Ordaraa BI finding ids — changing it would orphan every existing finding signal. */
const FINDING_ID_NAMESPACE = 'b0f4c6de-5a1c-4c0b-9d53-7d2a3e1f8a64';

/**
 * A stable id for a finding. Findings are computed on demand, not stored, so
 * there is no row id to point at — this derives one from what makes the
 * finding *that* finding (organization, kind, subject, period). The same
 * finding detected again always gets the same id, which is what lets Signals
 * dedupe and auto-resolve it. RFC 4122 version 5 (SHA-1, namespaced).
 */
export function buildFindingId(...parts: string[]): string {
  const namespace = Buffer.from(FINDING_ID_NAMESPACE.replace(/-/g, ''), 'hex');
  const bytes = Buffer.from(
    createHash('sha1')
      .update(namespace)
      .update(parts.join('|'))
      .digest()
      .subarray(0, 16),
  );

  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
