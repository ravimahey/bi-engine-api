import type { XeroTenantConnection } from '../types';

/**
 * Reads the `authentication_event_id` claim off a Xero access token (a JWT)
 * without verifying it — the token came straight from Xero's token endpoint
 * over TLS, and the claim is only used to pick which tenant was authorized in
 * *this* consent, not to make a trust decision. Returns `null` if absent.
 */
export function readAuthEventId(accessToken: string): string | null {
  const [, payload] = accessToken.split('.');
  if (!payload) return null;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { authentication_event_id?: unknown };
    return typeof claims.authentication_event_id === 'string'
      ? claims.authentication_event_id
      : null;
  } catch {
    return null;
  }
}

/**
 * Picks the tenant an organization just connected. One Xero login can
 * authorize many organisations over time, and `GET /connections` returns all
 * of them — so prefer the tenant(s) from this consent's `authEventId`, and
 * among those (or all, if none match) the most recently created one. Only
 * `ORGANISATION` tenants carry accounting data. `null` if there are none.
 */
export function pickConnectedTenant(
  tenants: XeroTenantConnection[],
  authEventId: string | null,
): XeroTenantConnection | null {
  const organisations = tenants.filter(
    (tenant) => tenant.tenantType === 'ORGANISATION',
  );
  const fromThisConsent = authEventId
    ? organisations.filter((tenant) => tenant.authEventId === authEventId)
    : [];
  const candidates = fromThisConsent.length ? fromThisConsent : organisations;

  return (
    [...candidates].sort((a, b) =>
      (b.createdDateUtc ?? '').localeCompare(a.createdDateUtc ?? ''),
    )[0] ?? null
  );
}
