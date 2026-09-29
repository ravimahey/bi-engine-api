import { SourceSystem } from '@modules/records/entities';
import type { XeroLineItemPayload, XeroReferenceIndex } from '../types';

/** Per-batch memo of external id → canonical id lookups, so a batch of bills doesn't re-query the same account/item/tax rate for every line. */
export type XeroLookupCache = Map<string, Promise<string | null>>;

/** Runs `find(externalId)` at most once per `kind`+id within one cache; `null` for a missing id. */
export function cachedLookup(
  cache: XeroLookupCache,
  kind: string,
  externalId: string | null | undefined,
  find: (externalId: string) => Promise<string | null>,
): Promise<string | null> {
  if (!externalId) return Promise.resolve(null);

  const key = `${kind}:${externalId}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = find(externalId);
    cache.set(key, pending);
  }
  return pending;
}

/** The line's account GUID: `AccountID` when Xero sends it, else `AccountCode` resolved through this run's index. */
export function resolveLineAccountId(
  line: XeroLineItemPayload,
  index: XeroReferenceIndex,
): string | null {
  if (line.AccountID) return line.AccountID;
  return line.AccountCode
    ? (index.accountIdByCode.get(line.AccountCode) ?? null)
    : null;
}

/** The line's item GUID: `Item.ItemID` when Xero sends it, else `ItemCode` resolved through this run's index. */
export function resolveLineItemId(
  line: XeroLineItemPayload,
  index: XeroReferenceIndex,
): string | null {
  if (line.Item?.ItemID) return line.Item.ItemID;
  return line.ItemCode ? (index.itemIdByCode.get(line.ItemCode) ?? null) : null;
}

/** Builds the code → GUID index from the Accounts/Items fetched this run. Accounts without a code (often bank accounts) can't be referenced by code anyway. */
export function buildXeroReferenceIndex(
  accounts: Array<{ AccountID: string; Code?: string }>,
  items: Array<{ ItemID: string; Code: string }>,
): XeroReferenceIndex {
  return {
    accountIdByCode: new Map(
      accounts
        .filter((account) => account.Code)
        .map((account) => [account.Code as string, account.AccountID]),
    ),
    itemIdByCode: new Map(items.map((item) => [item.Code, item.ItemID])),
  };
}

/** Canonical provenance fields every Xero-sourced upsert shares. */
export function xeroProvenance(
  context: { organizationId: string; sourceConnectionId: string },
  externalId: string,
) {
  return {
    organizationId: context.organizationId,
    sourceSystem: SourceSystem.XERO,
    sourceExternalId: String(externalId),
    sourceConnectionId: context.sourceConnectionId,
  };
}
