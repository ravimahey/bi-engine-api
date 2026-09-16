# QuickBooks Polling — Local Setup Guide


Everything that has to be true **before** `POST /quickbooks/poll` will do
anything useful, in the order it has to happen. Read this before you touch
`/quickbooks/poll` on a fresh local environment — almost every error you'll
hit ("not connected", "Unauthorized", "Failed to fetch") comes from skipping
one of the steps below, not from a bug in the endpoint itself.


**Audience:** anyone running/testing this backend locally, or a frontend
engineer wiring up the QuickBooks connect flow.


---


## Contents


1. [The model in one paragraph](#1-the-model-in-one-paragraph)
2. [Prerequisites](#2-prerequisites)
3. [Step-by-step: connect before you poll](#3-step-by-step-connect-before-you-poll)
4. [Calling the poll endpoint](#4-calling-the-poll-endpoint)
5. [What a poll actually does](#5-what-a-poll-actually-does)
6. [Environment variables involved](#6-environment-variables-involved)
7. [Troubleshooting](#7-troubleshooting)


---


## 1. The model in one paragraph


QuickBooks access is **per-organization**, not global. Each organization has
its own `ProviderConnection` row (`provider_connections` table, one per
`(organizationId, provider)`) holding that organization's realm id and
OAuth tokens. `POST /quickbooks/poll` never guesses which company to talk
to — it looks up `organizationId`'s own `ProviderConnection` and fails
closed if that row doesn't exist yet
(`QuickbooksAuthService.ensureProviderConnection`, `src/modules/quickbooks/services/quickbooks-auth.service.ts`).
That row is created by exactly one thing: successfully completing the
`/quickbooks/connect` → Intuit consent → `/quickbooks/callback` flow for
that `organizationId`. So the real dependency chain for a first-time local
poll is:


```
a real Organization row
        ↓
an authenticated admin session (cookie)
        ↓
GET /quickbooks/connect?organizationId=... (real browser navigation)
        ↓
Intuit sandbox login + consent
        ↓
/quickbooks/callback persists the ProviderConnection
        ↓
POST /quickbooks/poll { organizationId, fromDate, toDate }
```


Skip any link and poll fails — usually with a 401 that tells you which link
you skipped.


---


## 2. Prerequisites


- Local Postgres reachable and migrated (`pnpm migration:run`).
- `.env` has real QuickBooks sandbox credentials: `QUICKBOOKS_CLIENT_ID`,
  `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_ENVIRONMENT=sandbox`,
  `QUICKBOOKS_REDIRECT_URI` (`src/config/env.validation.ts`). The redirect
  URI must be registered under **Redirect URIs** on the same app in the
  Intuit Developer dashboard, character-for-character.
- At least one admin user already exists (via `/auth/signup` with
  `role: admin`, or a DB row) — `connect` and `poll` are both
  `@Roles(UserRole.ADMIN)`.
- A real `organizations` row to test with (see step 1 below) — there is no
  CRUD API for this yet (`src/modules/organizations/organizations.module.ts`
  is deliberately controller/service-less today), so it has to be inserted
  directly.


---


## 3. Step-by-step: connect before you poll


### 3.1 Create an organization to test with


`organizationId` has to point at a real row in `organizations`, not an
arbitrary UUID. Insert one directly:


```sql
INSERT INTO organizations (id, name, slug, is_active, created_at, updated_at, version)
VALUES (gen_random_uuid(), 'Test Org', 'test-org', true, now(), now(), 1)
RETURNING id;
```


Save the returned `id` — it's your `organizationId` for every step below.
(If `gen_random_uuid()` isn't available, generate one yourself, e.g.
`node -e "console.log(crypto.randomUUID())"`, and insert that literal value.)


### 3.2 Log in as an admin, in a real browser tab


The `/quickbooks/connect` step is a full browser redirect to Intuit, not an
API call — it has to run in an actual browser tab that's already carrying
your session cookie. So:


1. Open Swagger (`http://localhost:8000/api/docs` — path from
   `SWAGGER_PATH`) in your browser.
2. Run **`POST /auth/login`** via "Try it out" with your admin credentials.
   This is what matters — it makes the browser store the `access_token`
   httpOnly cookie for `localhost` (`src/common/utils/cookie.util.ts`).
3. Do **not** rely on pasting a token into Swagger's "Authorize" 🔒 dialog
   for this flow — that only attaches a header to Swagger's own requests,
   it never sets a cookie in your browser. A plain address-bar navigation
   carries no custom headers, so an Authorize-only "login" will 401 on the
   next step.

### 3.3 Hit `/quickbooks/connect` — as a page navigation, not a fetch


In the **same browser** (so the cookie from 3.2 is attached), paste this
directly into the address bar and hit enter:


```
http://localhost:8000/api/v1/quickbooks/connect?organizationId=<id-from-3.1>
```


Do not click "Try it out" in Swagger for this endpoint, and don't call it
from Postman/`fetch`/`axios`. It responds with a redirect to Intuit's
consent screen, a different origin — an AJAX call enforces CORS on that
redirected response and fails with "Failed to fetch," even though the
endpoint itself is working correctly. Only a real navigation can follow it.


### 3.4 Approve the connection in Intuit's sandbox


Log into the Intuit sandbox company you want to test against and approve
the consent screen. Intuit redirects back to
`QUICKBOOKS_REDIRECT_URI` (`/quickbooks/callback`) with a code and
`realmId`. `QuickbooksAuthService.handleCallback` exchanges that code for
tokens and — this is the step that actually unblocks polling — upserts a
`ProviderConnection` keyed to the `organizationId` that was embedded in the
signed OAuth `state` back in 3.3
(`QuickbooksAuthService.exchangeToken`, same file).


You should land on `${FRONTEND_URL}/settings/integrations?quickbooks=connected`.
If you land on `...?quickbooks=error` instead, check the server console —
`handleCallback` logs the real failure reason there (bad redirect URI
mismatch, invalid/expired `state`, etc.).


### 3.5 (Optional) verify the connection landed


Confirm a `provider_connections` row now exists for your organization and
provider:


```sql
SELECT id, organization_id, provider, external_realm_id, status
FROM provider_connections
WHERE organization_id = '<id-from-3.1>';
```


`status` should read `connected`. If there's no row at all, step 3.3/3.4
didn't complete — go back and check the server logs from the callback.


---


## 4. Calling the poll endpoint


Only once section 3 is fully done:


```
POST http://localhost:8000/api/v1/quickbooks/poll
Content-Type: application/json

{
  "organizationId": "<id-from-3.1>",
  "fromDate": "2026-01-05",
  "toDate": "2026-09-13"
}
```


This one **is** fine to call from Swagger/Postman/`fetch` — it's a normal
JSON API call, not a redirect. It still needs the admin `access_token`
cookie (or `Authorization: Bearer` in Swagger/Postman), same as any other
protected endpoint.


Optional `entities` array restricts the poll to specific entities (see
`QUICKBOOKS_POLL_ENTITY_ORDER` below) — omit it to sync everything.


---


## 5. What a poll actually does


`QuickbooksPollingService.poll` (`src/modules/quickbooks/services/quickbooks-polling.service.ts`)
walks entities in a fixed dependency order, never the order you list them
in `entities`:


```
Vendor → Account → Item → TaxRate        (master data, always full re-sync)
Bill → Purchase → VendorCredit → BillPayment   (transactions, date-chunked)
```


- **Master data** has no `TxnDate`, so every poll re-fetches it in full
  (paginated) — the `SyncCursor` just timestamps when that last happened.
- **Transactions** resume from each entity's own `SyncCursor`: the requested
  `fromDate` is only a floor — if a prior poll already advanced past it,
  the poll starts from the cursor instead, chunked by month
  (`QUICKBOOKS_POLL_CHUNK_UNIT`). A chunk's cursor only advances after that
  chunk's fetch → raw ingest → canonical mapping has fully succeeded, so a
  failure mid-poll never loses or re-does completed work.
- **One entity failing never blocks another** — each entity gets its own
  try/catch and reports its own `status` (`completed` / `partial` /
  `failed` / `skipped`) in the response body.
- Only one poll can run at a time **per connection** — a second call while
  one is in flight gets a `409 ConflictException`, not queued.


---


## 6. Environment variables involved


| Variable | Purpose |
|---|---|
| `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET` | Intuit sandbox app credentials |
| `QUICKBOOKS_ENVIRONMENT` | `sandbox` locally |
| `QUICKBOOKS_REDIRECT_URI` | Must exactly match a Redirect URI registered on the Intuit app, and match `PORT`/`API_PREFIX`/`API_VERSION` (`http://localhost:<PORT>/<API_PREFIX>/v1/quickbooks/callback`) |
| `FRONTEND_URL` | Where `/quickbooks/callback` redirects after success/error |
| `COOKIE_DOMAIN` | Leave blank locally — anything else and the admin session cookie won't attach to `localhost`, and step 3.3 will 401 before it even reaches Intuit |
| `PORT` / `API_PREFIX` | Determine the base URL for every step above (`http://localhost:8000/api/v1/...` with this repo's current `.env`) |


Never commit real values for these — `.env` is local-only.


---


## 7. Troubleshooting


| Symptom | Cause | Fix |
|---|---|---|
| `401 ... QuickBooks is not connected for organization "..."` on poll | Section 3 was never completed for that `organizationId` | Do steps 3.1–3.4 for that exact id |
| `401 Unauthorized` on `/quickbooks/connect` in the browser | Logged in via Swagger's Authorize dialog only, not an actual `/auth/login` call — no cookie was ever set | Redo step 3.2, running `POST /auth/login` itself |
| Swagger shows `Failed to fetch` / CORS / "URL scheme must be http or https" on `/quickbooks/connect` | Called it via Swagger "Try it out" or `fetch`/`axios` — it's a redirect to a different origin, which AJAX can't follow cross-origin | Paste the URL into the address bar instead (step 3.3) |
| Callback redirects to `...?quickbooks=error` | Redirect URI mismatch, expired/invalid `state`, or Intuit token exchange failed | Check server console logs from `handleCallback` — it logs the real reason |
| `409 ConflictException: A QuickBooks poll is already running...` | A previous poll for that connection is still in flight (or crashed without releasing the in-memory lock, which only clears on process restart) | Wait for it to finish, or restart the dev server locally |
| Poll succeeds but an entity comes back `"status": "failed"` | That specific entity's fetch/ingest/map threw — check `error` in that entity's result and the server logs | Doesn't block other entities; fix and re-poll, it resumes from each entity's own cursor |
| Poll runs but nothing changed for a transactional entity | `fromDate` is behind that entity's existing `SyncCursor`, so the effective start is the cursor, not your `fromDate` | Check `SyncCursor` via `provider_connections`/`sync_cursors`, or use a later `toDate` |
