# Admin APIs — R&D Proposal

This is a proposal, not a build log — nothing below is implemented yet.
It's the result of reading every module currently in `src/modules`, the
existing `Roles(UserRole.ADMIN)` surface, and the product docs
(`PROJECT_CONTEXT.md`, `WHY_THESE_MODULES.md`) to work out what an "admin
API" should mean for Ordaraa specifically, not admin APIs in the generic
CRUD-backoffice sense. Review it, cut/reorder/reprioritize, and whatever
survives becomes the actual implementation plan.

## 1. What "admin" already means in this codebase today

Ordaraa doesn't have a separate admin app — `UserRole.ADMIN` is a role on
the same `User` entity as `SUPPLIER`/`BUYER`, gated per-endpoint by the
existing `@Roles()` decorator + global `RolesGuard` (`app.module.ts`
wires `JwtAuthGuard` then `RolesGuard` as `APP_GUARD`s, so every route is
role-checked for free). Two patterns already exist side by side:

- **Admin-only CRUD modules** — `UsersController` (whole controller is
  `@Roles(ADMIN)`) and the admin-only parts of `OrganizationsController`
  (`findAll`, `remove`; `restore` exists today but is to be removed, see §3.0).
- **"Your own org, unless admin" endpoints** — most of `AnalyticsController`
  and `QuickbooksController`: any signed-in user can call them for their
  own `organizationId`, and an admin can pass *any* `organizationId`
  (enforced in the service layer via `assertOwnOrganization`, not in the
  controller).

So today, "admin" mostly means **elevated access to per-tenant data that
already has a user-facing endpoint** — not a distinct admin surface. That's
fine for tenant self-service, but it leaves a real gap: nobody currently
has a way to look *across* tenants. There's no "list every organization's
sync health," no "which connections are broken right now," no audit trail
of what an admin did. That gap is what this proposal targets.

## 2. Gaps found during R&D

Working through `modules/providers`, `modules/quickbooks`, and the product
docs surfaced four concrete gaps, each because the underlying data already
exists but nothing reads it cross-tenant:

1. **No cross-tenant operational visibility.** `ProviderConnection` tracks
   `status` (`pending`/`connected`/`error`/`disconnected`) and `lastError`
   per org, and `SyncCursor` tracks `lastSyncedAt` per entity type per
   connection — but both are only ever read scoped to one org (via
   `QuickbooksSyncStatusService`). Nobody can currently ask "which of our
   customers have a broken QuickBooks connection right now" without a raw
   SQL query. For a BI product whose whole value proposition depends on
   fresh synced data, this is the highest-value gap.
2. **No audit trail for admin actions.** Soft-deleting an organization,
   deactivating a user, or disconnecting someone's QuickBooks are all
   destructive-ish actions gated only by role — there's no record of
   *which* admin did it or *when*. `BaseEntity` gives every row
   `deletedAt`/`version`, which helps forensically, but there's no
   "admin X deleted org Y at time Z" log.
3. **No cross-tenant findings visibility.** `PROJECT_CONTEXT.md` describes
   the core loop as Findings → "See Why" → Fix → Outcome
   (Potential/Reported/Observed), but that outcome-tracking has no entity
   yet — `analytics/services/*` compute findings live from SQL aggregates,
   nothing is persisted. Anything cross-tenant here (e.g., "which
   customers have unactioned findings worth reaching out about") is
   blocked on that persistence layer existing first — flagged below as
   Phase 2, not something to build against today's schema.
4. **No support-facing tooling.** `PROJECT_CONTEXT.md`'s "restricted 'Ask
   Ordaraa' AI chat" and general support workflow will eventually need an
   admin to see what a specific tenant sees without raw DB access — no
   such capability exists.

## 3. Proposed admin API surface

### 3.0 Admin full-access CRUD ("admin can see and manage everything")

**Implemented** for users and organizations, in the new `modules/admin`
(all `@Roles(ADMIN)`, all under `/admin/*`).

**Decision: the admin module exposes no create and no restore for users or
organizations.** Users sign up themselves and create their own
organization (self-serve); admins only view, update and soft-delete.

**The admin module is purely additive.** No existing controller, service or
file was changed or removed: `/users/*` and `/organizations/*` keep working
exactly as before. The admin module just wraps their exported services
under `/admin/*`.

| Resource | List all | Get by id | Update | Delete | Status |
|---|---|---|---|---|---|
| Users | `GET /admin/users` | `GET /admin/users/:id` | `PATCH /admin/users/:id` | `DELETE /admin/users/:id` (soft) | **Done** |
| Organizations | `GET /admin/organizations` | `GET /admin/organizations/:id` | `PATCH /admin/organizations/:id` | `DELETE /admin/organizations/:id` (soft) | **Done** |
| Provider connections | `GET /admin/provider-connections` | `GET /admin/provider-connections/:id` | — | `POST /admin/provider-connections/:id/force-disconnect` | **Not built yet** (see §3.2) |
| Records (vendors, categories, items, expense/sales transactions, vendor credits, payments, customers, company profile) | Only per org (`organizationId` required) | Yes, per org | n/a (synced from QuickBooks) | n/a | **Read-only, org-scoped.** An admin can read any one org's data but cannot list across all orgs. |

Note: the older `/users/*` (admin-only) and `/organizations/*` routes,
including their restore endpoints, still exist untouched. Retiring them,
if ever wanted, is a separate decision.

What's worth adding beyond what exists:

- **Extra user admin actions** (to be added in `modules/admin`):
  `PATCH /users/:id/role` (change role), `PATCH /users/:id/status`
  (activate/deactivate via `isActive`), `POST /users/:id/revoke-sessions`
  (clears `hashedRefreshToken`), `POST /users/:id/reset-password`
  (admin-triggered reset email). These are the things an admin actually
  needs day to day; today they'd all go through the generic `PATCH`.
- **Cross-tenant record browsing**: make `organizationId` optional for
  admins on the `/records/*` list endpoints so an admin can search e.g.
  every vendor or every expense transaction across all orgs.
- **Deliberately not proposed: admin edit/delete of synced records.**
  Vendors, transactions, etc. are a translated copy of QuickBooks data
  (see `WHY_THESE_MODULES.md`); the next sync would overwrite any edit
  and silently break the "proven from source" guarantee. If a record is
  wrong, the fix is a resync (§3.2), not a manual edit. The one exception
  worth a decision is a soft-delete/"ignore this record" flag for
  duplicates surfaced by the data-quality findings.
- **Hard delete**: keep soft delete as the default (per `CLAUDE.md`). If a
  permanent delete is needed (e.g. a tenant's GDPR erasure request), add a
  separate, explicit `DELETE /admin/organizations/:id/permanent` that is
  audit-logged (§3.3) rather than making it a query flag on the normal one.

### 3.1 Tenant operations dashboard — new `modules/admin`

**Status:** `GET /admin/organizations/overview` and
`GET /admin/organizations/:id/overview` are implemented in the same
`/admin/organizations` controller. `/activity` is not built (needs §3.3).
`lastSyncedAt` is the oldest last-synced time across the org's sync cursors;
"open error count" is the number of connections in `error` status.

This is the centerpiece: a **read-mostly aggregation layer** over
`organizations`, `providers`, and `quickbooks` — the same architectural
role `analytics` already plays over `records`. It doesn't own any new
domain concept (no new entity naming a business thing), so per the
common-vs-module rule in `CLAUDE.md` it earns its own module rather than
living inside `organizations` (which shouldn't have to import
`providers`/`quickbooks` just to serve a dashboard) or `providers` (which
is deliberately provider-agnostic and shouldn't know it's being read for
an admin screen).

| Method & Path | Purpose | Notes |
|---|---|---|
| `GET /admin/organizations/overview` | Paginated list: one row per org with `isActive`, user count, provider connection status, last-synced-at (most stale entity), open error count | Backs an "all tenants" admin table — the single most useful screen for this product. Built from `Organization` + `ProviderConnection` + `SyncCursor`, no new columns needed. |
| `GET /admin/organizations/:id/overview` | Same shape as above, single org, plus per-entity `SyncCursor` breakdown | Drill-down from the table row. |
| `GET /admin/organizations/:id/activity` | Recent admin actions taken on this org (see audit log, §3.3) | Only meaningful once §3.3 exists — ship after. |

All `@Roles(UserRole.ADMIN)`, all reusing `PaginationQueryDto`/`paginate()`
per the Postgres conventions in `CLAUDE.md`. No new entities — pure
read-composition of existing services (`OrganizationsService`,
`ProviderConnectionsService`, plus a small new query for sync-cursor
staleness), so this is the lowest-risk, highest-value piece to build first.

### 3.2 Provider connection operations

`ProviderConnectionsService` already has everything needed
(`findById`, `markError`, `markDisconnected`) — it's just never been given
a cross-tenant controller. This belongs in `modules/providers` itself
(it's operating on `ProviderConnection`, the module's own entity), not in
the new `admin` module.

| Method & Path | Purpose | Notes |
|---|---|---|
| `GET /admin/provider-connections` | Paginated list across **all** orgs, filterable by `status`/`provider` | The "show me every connection currently in `error` state" screen. |
| `GET /admin/provider-connections/:id` | Single connection detail (status, `lastError`, `connectedAt`, expiries) — tokens never returned, same `select: false`/`@Exclude()` guard as everywhere else | |
| `POST /admin/provider-connections/:id/force-disconnect` | Admin-initiated disconnect for a connection stuck in a bad state, without needing the tenant to click anything | Thin wrapper over `markDisconnected` — reuse `QuickbooksAuthService.disconnect`'s cleanup, don't duplicate it. |
| `POST /admin/provider-connections/:id/resync` | Re-triggers `QuickbooksPollingService.poll` for that org, bypassing "must be your own org" | Support's answer to "my dashboard looks stale" without waiting for the tenant to notice and click sync themselves. |

### 3.3 Audit log — new, small, foundational

Needed *before* shipping any of the destructive/elevated actions above
(force-disconnect, resync, impersonation) — otherwise "an admin can act on
any tenant's data" ships with zero accountability. This is domain-agnostic
and used by every module that has admin actions, so it's a `common`
citizen at the entity/interceptor level, with its own thin module for the
read API.

- **New entity** `AuditLog extends BaseEntity`: `actorUserId`, `action`
  (string, e.g. `"organization.delete"`), `targetType`, `targetId`,
  `metadata` (jsonb, small — e.g. `{ previousStatus, newStatus }`), no
  `deletedAt`/soft-delete (audit rows are permanent by design).
- Write side: not a decorator-magic interceptor (too easy to under/over
  log) — each admin action explicitly calls
  `auditLogService.record(user, action, target)` at the point it commits,
  same way `ProviderConnectionsService.markError` already logs via
  `Logger` today, just persisted instead of just logged to stdout.

| Method & Path | Purpose | Notes |
|---|---|---|
| `GET /admin/audit-logs` | Paginated, filterable by `actorUserId`/`targetType`/`targetId`/date range | Read-only, `@Roles(ADMIN)`. |

### 3.4 Findings oversight — Phase 2, blocked on a persistence gap

Not buildable cleanly against today's schema — flagging so it's not
forgotten, not proposing endpoints yet. `analytics/services/*`
(`CostIncreaseFindingService`, `DataQualityService`) compute findings live;
nothing persists a finding, its "Potential/Reported/Observed" outcome, or
which owner acted on it, even though `PROJECT_CONTEXT.md` describes that
lifecycle as core to the product. Once a `Finding`/`FindingOutcome` entity
exists in `records` (or a new module) for the tenant-facing feature, the
admin-facing version is one query: `GET /admin/findings/summary` —
cross-tenant counts of open/actioned findings and total flagged spend, to
prioritize customer-success outreach ("these 5 tenants have $12k in
unactioned findings"). Don't build this endpoint before the underlying
entity exists — it'd have nothing real to aggregate.

### 3.5 Support impersonation — Phase 2, sensitive

Flagged, not designed in detail, because it's the riskiest item here and
deserves its own decision (and explicit sign-off) before any implementation
work starts:

- `POST /admin/organizations/:id/impersonate` → short-lived, clearly-scoped
  token that lets an admin see exactly what a tenant sees, for support
  debugging.
- Hard prerequisite: §3.3 (audit log) must exist first and must log every
  impersonation start/end — this is the one action in this whole doc that
  should never ship without an audit trail already in place.
- Needs its own token type (short TTL, maybe a distinct claim like
  `impersonatedBy`) rather than reusing the normal access/refresh pair, so
  it can't be mistaken for or replayed as a real tenant session.

### 3.6 Platform stats

| Method & Path | Purpose | Notes |
|---|---|---|
| `GET /admin/system/stats` | Org count (active/inactive), user count by role, connections by status, total ingested transaction rows | Single-purpose internal ops view — cheap `COUNT`/`GROUP BY` queries, no pagination needed since it's aggregate scalars, not a list. |

## 4. Suggested build order

0. **§3.0 extras** (user role/status/revoke-sessions, optional
   `organizationId` for admins on records lists) — small changes to
   existing controllers, can ship right away.
1. **§3.1 Tenant operations dashboard** — pure read composition of
   existing data, no new entities, immediately useful, zero risk of
   introducing a destructive action without a safety net.
2. **§3.3 Audit log** — small, foundational, and a hard prerequisite for
   everything after it.
3. **§3.2 Provider connection ops** — now that actions are auditable,
   ship `force-disconnect`/`resync`.
4. **§3.6 Platform stats** — cheap, nice-to-have, no dependencies.
5. **§3.4 Findings oversight** — only after the tenant-facing findings
   persistence layer exists (separate piece of work, not admin-specific).
6. **§3.5 Impersonation** — last, and only with explicit go-ahead given
   how sensitive it is.

## 5. Open questions for you to decide

- Is a distinct `modules/admin` (for §3.1/§3.6) the right call, or would
  you rather each module (`organizations`, `providers`) grow its own
  `/admin/*` sub-routes on its existing controller? The proposal above
  assumes the former because the dashboard's whole point is crossing
  module boundaries, which is exactly what `analytics` already does for
  the same reason.
- Does impersonation (§3.5) belong in this product at all, or is "admin
  can query any org's existing endpoints" (today's pattern) enough for
  support's needs? It's the one item here that changes the security
  posture of the whole app, not just adds a screen.
- For the audit log (§3.3): permanent rows forever, or a retention window?
  Nothing in `CLAUDE.md`'s soft-delete convention fits an audit row (it
  should never be deletable by the thing it's auditing), so this needs an
  explicit decision either way.
