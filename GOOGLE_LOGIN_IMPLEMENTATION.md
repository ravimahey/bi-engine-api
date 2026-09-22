# Google Login (ID-token flow) — Implementation Plan

> **Question this answers:** What exactly do I need to add/change in this
> backend to implement Google Login, and how do I test that it works end-to-end?

**Status:** plan only — nothing is implemented yet.

---

## 0. Read this first: what already exists

Google login is **already partly built** as a *server-side redirect* flow
(Passport). Do not rebuild it:

| Piece | Where |
|---|---|
| `GET /api/v1/auth/google` (starts flow, redirects to Google) | `AuthController.googleAuth` — `src/modules/auth/auth.controller.ts` |
| `GET /api/v1/auth/google/callback` (sets cookies, redirects to frontend) | `AuthController.googleCallback` |
| Passport strategy `'google'` (`passport-google-oauth20`) | `src/modules/auth/strategies/google.strategy.ts` |
| Guards | `GoogleInitGuard` (`src/modules/auth/guards`), `GoogleOauthGuard` (`src/common/guards`) |
| Find / link / create logic | `AuthService.loginWithGoogle(profile)` — `src/modules/auth/services/auth.service.ts` |
| DB helpers | `UserCredentialsService.findByGoogleId / linkGoogleAccount / createFromGoogle` — `src/modules/users/services/user-credentials.service.ts` |
| DB columns | `users.google_id` (unique, nullable) and `users.password_hash` (nullable) — already in `InitialSchema` migration |
| Env/config | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` in `.env.example`, `src/config/app.config.ts`, `src/config/env.validation.ts` |

**What is missing** is the **ID-token flow**: the frontend uses Google Identity
Services ("Sign in with Google" button / One Tap), gets a signed **ID token**
(a JWT from Google) in the browser, and POSTs it to our API. The backend
verifies it and logs the user in. That is a new endpoint — it **reuses**
`loginWithGoogle()` and `AuthTokenService.startSession()` unchanged, so both
flows end in exactly the same session.

> Redirect flow = browser leaves our site, goes to Google, returns to
> `/auth/google/callback`. ID-token flow = popup/One Tap on our site, browser
> gets a token, our frontend `POST`s it. Same result: cookies set, same user
> table. Keep the redirect flow; add the token flow beside it.

---

## 1. How our current login works

**Email + password** (`POST /api/v1/auth/login`, `AuthService.login`):

1. `LoginDto` (email, password) validated by the global `ValidationPipe`.
2. `UsersService.findByEmailWithSecret(email)` — lowercases the email and
   selects the `select: false` columns (`SECRET_FIELDS` in
   `src/modules/users/constants/users.constants.ts`).
3. No user → `401 Invalid email or password`. `passwordHash` null (Google-only
   account) → `401 This account uses Google Sign-In…`. `isActive` false →
   `403`.
4. `PasswordService.verify` compares the hash.
5. `AuthTokenService.startSession(user)` (`src/modules/auth/services/auth-token.service.ts`):
   - signs an **access JWT** (`JWT_ACCESS_SECRET`, 15m) and **refresh JWT**
     (`JWT_REFRESH_SECRET`, 7d), both with claims
     `{ sub: user.id, email, role, organizationId, jti }`;
   - stores a hash of the refresh token in `users.hashed_refresh_token`
     (`setRefreshToken`) — this is what makes it revocable/rotatable;
   - sets `last_login_at`.
6. `AuthController.attachSession` calls `setAuthCookies` (`src/common/utils/cookie.util.ts`)
   → two **httpOnly cookies** (`ACCESS_TOKEN_COOKIE`, `REFRESH_TOKEN_COOKIE`;
   refresh cookie is path-scoped to `/api/v1/auth`) and returns the `User`
   in the response body (tokens are **not** in the body).

**Protected routes:** `JwtAuthGuard` is a global `APP_GUARD` in
`src/app.module.ts` (with `ThrottlerGuard` and `RolesGuard`). Routes are
protected unless marked `@Public()`. `JwtStrategy`
(`strategies/jwt-access.strategy.ts`) reads the access token from the cookie
first, then `Authorization: Bearer`, and puts `AuthPrincipal
{ id, email, role, organizationId }` on `req.user` (`@CurrentUser()`).

**Refresh / logout:** `POST /auth/refresh` (`JwtRefreshGuard`, rotates the
pair, detects reuse), `POST /auth/logout` (clears the stored hash + cookies).

**Existing Google redirect flow** ends in the same place:
`loginWithGoogle(profile)` →
1. `findByGoogleId(profile.googleId)` → found: use it.
2. Else `findByEmailWithSecret(profile.email)` → found: `linkGoogleAccount`
   (sets `google_id`), use it.
3. Else `createFromGoogle` (role from `requestedRole`, `passwordHash: null`,
   `isActive: true`).
4. `!user.isActive` → `403`. Then `startSession(user)`.

The user model: `User` in `src/modules/users/entities/user.entity.ts`
(`email` unique, `googleId` unique nullable, `passwordHash` nullable,
`role` enum admin/supplier/buyer, `organizationId` nullable, `avatarUrl`,
`isActive`).

---

## 2. What needs to be added

Four small additions, all **additive** (no existing behavior changes):

1. **A verifier service** that takes a Google ID token and returns a trusted
   `GoogleProfile` (the same `GoogleProfile` type `loginWithGoogle` already
   takes, from `src/modules/auth/types/jwt-payload.interface.ts`).
2. **A DTO** for the request body.
3. **`AuthService.loginWithGoogleIdToken(dto)`** — verify, then delegate to
   the existing `loginWithGoogle(profile)`.
4. **`POST /api/v1/auth/google/token`** in `AuthController` — `@Public()`,
   returns the `User` and sets cookies through the existing `attachSession`.

One new dependency: **`google-auth-library`** (Google's official verifier).
It is *not* installed today — only `passport-google-oauth20` is, and that
package cannot verify ID tokens.

---

## 3. Google Cloud / OAuth credentials required

You very likely already have a client from the redirect flow. Reuse it.

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   → select/create the project.
2. **OAuth consent screen**: user type External; scopes `openid`, `email`,
   `profile` (non-sensitive, no Google review needed). While the app is in
   *Testing* status, only listed **test users** can sign in — add your
   Google accounts, or publish the app.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
4. **Authorized JavaScript origins** (required for the ID-token flow — this is
   where the frontend button runs): `http://localhost:3001` (our
   `FRONTEND_URL`) plus the staging/production frontend origins.
5. **Authorized redirect URIs**: only needed for the *existing* redirect flow
   (`GOOGLE_CALLBACK_URL`, e.g. `http://localhost:3000/api/v1/auth/google/callback`).
   The ID-token flow does not use it.
6. Copy the **Client ID** (`…apps.googleusercontent.com`).

**Critical rule:** the frontend's Google button and the backend's
`GOOGLE_CLIENT_ID` must be the **same Web client ID**. The ID token's `aud`
(audience) claim is that client ID, and the backend rejects any token whose
`aud` doesn't match (that is the "wrong Google client" protection, §6).

The **client secret is not needed** to verify ID tokens (verification uses
Google's public keys). It stays only for the redirect flow.

---

## 4. Database changes required

**None. No migration.**

- `users.google_id varchar(255) NULL UNIQUE` already exists (unique constraint
  `UQ_0bd5012aeb82628e07f6a1be53b` in `1788832526250-InitialSchema.ts`) — it
  will store Google's `sub` claim (stable, unique per Google account; never use
  email as the identity key).
- `users.password_hash` is already nullable, so Google-only accounts work.
- `users.avatar_url` already exists (optional: fill from Google's `picture`
  claim on creation only — see §7 note).
- `google_id` lookups are already indexed by the unique constraint, so the
  index rule in `CLAUDE.md` is satisfied.

If a later decision changes this (e.g. storing multiple providers per user),
that would be a new `AddUserIdentities` migration with a tested `down()` — out
of scope for this plan.

---

## 5. New backend API required

### `POST /api/v1/auth/google/token`

| | |
|---|---|
| Access | `@Public()` (no JWT needed — it *creates* the session). Global `ThrottlerGuard` already applies; consider a tighter `@Throttle` like the AI controllers use. |
| Body | `GoogleLoginDto` |
| Success | `200 OK`, `@HttpCode(HttpStatus.OK)`, `@ResponseMessage('Logged in successfully')`. Sets the two auth cookies; body `data` is the `User` — **identical to `POST /auth/login`**. |
| Errors | `400` validation (missing `idToken`, bad `role`) · `401` invalid/expired token, wrong audience, unverified email · `403` account deactivated |

Request body:

```json
{ "idToken": "<Google credential JWT>", "role": "buyer" }
```

`GoogleLoginDto` (`src/modules/auth/dto/google-login.dto.ts`):
- `idToken`: `@IsString() @IsNotEmpty() @MaxLength(4096)` (Google ID tokens are
  ~1–2 KB).
- `role`: `@IsOptional() @IsIn(SELF_SERVICE_ROLES)` — same rule as
  `SignupDto`; only used when a **brand-new** account is created, ignored
  otherwise; defaults to `buyer`. **Admin must never be self-assignable.**

Controller stays thin per `CLAUDE.md`: DTO → one service call →
`attachSession`. The controller is already ~280 lines; this adds ~15, which is
acceptable, but don't add more auth endpoints there without splitting.

---

## 6. How Google ID token verification will work

New service: `GoogleTokenVerifierService`
(`src/modules/auth/services/google-token-verifier.service.ts`, one
`@Injectable()` per file, exported from `services/index.ts`).

```ts
// shape only — not implemented
verify(idToken: string): Promise<GoogleProfile>
```

Steps inside `verify`:

1. Build one `OAuth2Client` from `google-auth-library` (constructor, no secret
   needed) and read `getAppConfig(configService).auth.googleClientId`.
2. `client.verifyIdToken({ idToken, audience: googleClientId })`. The library:
   - fetches and **caches Google's public signing keys**, verifies the JWT
     **signature**;
   - checks `iss` is `accounts.google.com` / `https://accounts.google.com`;
   - checks **`aud` equals our client ID** → wrong-client tokens fail;
   - checks `exp` (expired tokens fail).
3. Any thrown error → `UnauthorizedException('Invalid Google token')`. Never
   echo the library's message to the client; `logger.warn` it instead (same
   style as `AuthController.googleCallback`).
4. Read `payload = ticket.getPayload()`. Require:
   - `payload.sub` present → becomes `googleId`;
   - `payload.email` present **and `payload.email_verified === true`** →
     otherwise `401`. This matters: we auto-link by email (§7), so an
     unverified email would allow account takeover.
5. Map to `GoogleProfile`: `email` lowercased (matches how `users.email` is
   stored and how `findByEmailWithSecret` queries), `firstName =
   payload.given_name ?? payload.name ?? 'User'`, `lastName =
   payload.family_name ?? ''`, `googleId = payload.sub` — the same fallbacks
   `GoogleStrategy.validate` uses. `requestedRole` is filled by
   `AuthService` from the DTO, not by the verifier.

Config gotcha: `app.config.ts` defaults `googleClientId` to
`'mock-client-id'` when the env var is blank. That **fails closed** (no real
token has that audience), which is fine, but a "everything is 401 locally"
symptom means `GOOGLE_CLIENT_ID` is unset.

---

## 7. How we find / create / link the user

`AuthService.loginWithGoogleIdToken(dto)`:

```ts
// shape only
const profile = await this.googleTokenVerifier.verify(dto.idToken);
return this.loginWithGoogle({ ...profile, requestedRole: dto.role ?? UserRole.BUYER });
```

and the **existing, unchanged** `loginWithGoogle` handles the three cases:

| Case | What happens |
|---|---|
| **New Google user** (no `google_id` match, no email match) | `createFromGoogle` → row with `google_id`, `password_hash = null`, role = requested (buyer default), `organizationId = null` (user creates/joins an org later, same as password signup). |
| **Existing Google user** (`google_id` match) | Loaded via `findByGoogleId`; no writes except session/`last_login_at`. |
| **Existing email/password user** (email match, no `google_id`) | `linkGoogleAccount` sets `google_id` on the existing row — **no duplicate user**; the password keeps working too. Safe only because §6 required `email_verified`. |

Then `isActive` is checked (`403` if deactivated) and `startSession` runs.

Things to know / decide (none block the plan):

- **`google_id` mismatch on link.** If the email-matched account already has a
  *different* `google_id`, `loginWithGoogle` currently overwrites it. Rare
  (Google `sub` is permanent), but a stricter behavior would be to reject
  with `401`. That edits existing code, so it is **not** in this plan unless
  you approve it.
- **Soft-deleted users.** `findByEmailWithSecret` ignores soft-deleted rows but
  `users.email` is unique, so a Google sign-in for a soft-deleted user's email
  would hit a unique-violation (`23505`) on create → `500`. Same pre-existing
  behavior as the redirect flow; worth a follow-up, not a blocker.
- **Avatar.** `createFromGoogle` doesn't set `avatarUrl`. Leave it; users
  upload via `PATCH /auth/profile`.
- **Role for an existing user is never changed** by the `role` field.

---

## 8. How Google Login uses our existing JWT

Nothing new. The Google ID token is used **once**, only to prove identity,
and then thrown away. The session is issued by the same
`AuthTokenService.startSession(user)`:

- Our own access JWT (`JWT_ACCESS_SECRET`) + refresh JWT
  (`JWT_REFRESH_SECRET`), same claims (`sub, email, role, organizationId, jti`).
- Set as the same httpOnly cookies by `setAuthCookies`.
- Refresh token hash stored in `users.hashed_refresh_token`, so
  `/auth/refresh`, `/auth/logout` and the reuse detection all work unchanged.
- Every protected route is authorized by `JwtStrategy` exactly as for
  password users — the backend cannot tell (and doesn't care) how the user
  logged in.

The Google ID token is **never** accepted on any other route.

---

## 9. Environment variables required

**No new required variables.** The verifier reuses:

| Var | Use in ID-token flow |
|---|---|
| `GOOGLE_CLIENT_ID` | **Required, must be real.** The expected `aud`. Must equal the frontend's client ID. |
| `GOOGLE_CLIENT_SECRET` | Not used by this flow (still used by redirect flow). |
| `GOOGLE_CALLBACK_URL` | Not used by this flow. |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `*_EXPIRES_IN` | Unchanged — issue our session. |
| `FRONTEND_URL`, `CORS_ORIGINS`, `COOKIE_DOMAIN` | Unchanged — frontend must call with `credentials: 'include'` and its origin must be allowed so the `Set-Cookie` sticks (see `auth.md` §6). |

Optional, only if you later add a mobile/second client: a comma-separated
`GOOGLE_ALLOWED_CLIENT_IDS` (the library's `audience` accepts an array). It
would need entries in `env.validation.ts`, `app.config.ts` (`auth` block) and
`.env.example`. Skip for now.

`.env.example` needs only a comment tweak (note that `GOOGLE_CLIENT_ID` is
also the ID-token audience) — optional.

---

## 10. Files to create / change

**Install** (use pnpm): `pnpm add google-auth-library`

**Create**

| File | Purpose |
|---|---|
| `src/modules/auth/dto/google-login.dto.ts` | `GoogleLoginDto { idToken, role? }` |
| `src/modules/auth/services/google-token-verifier.service.ts` | ID-token verification → `GoogleProfile` |
| `src/modules/auth/services/google-token-verifier.service.spec.ts` | Unit tests (mock `OAuth2Client`) |
| `src/modules/auth/services/auth.service.spec.ts` | Unit tests for `loginWithGoogleIdToken` / `loginWithGoogle` cases (no spec exists for `AuthService` today) |

**Change (additive only)**

| File | Change |
|---|---|
| `src/modules/auth/dto/index.ts` | add `export { GoogleLoginDto } from './google-login.dto';` |
| `src/modules/auth/services/index.ts` | add `export * from './google-token-verifier.service';` |
| `src/modules/auth/services/auth.service.ts` | inject `GoogleTokenVerifierService`; add `loginWithGoogleIdToken(dto)`. Leave `loginWithGoogle` untouched. |
| `src/modules/auth/auth.controller.ts` | add `@Public() @Post('google/token')` handler |
| `src/modules/auth/auth.module.ts` | add `GoogleTokenVerifierService` to `providers` |
| `package.json` / `pnpm-lock.yaml` | new dependency |
| `auth.md` | document the endpoint for frontend devs (endpoint table + a "Sign in with Google" flow) |
| `.env.example` | optional comment only |

**Not touched:** `user.entity.ts`, migrations, `UserCredentialsService`,
`UsersService`, `AuthTokenService`, guards, strategies, `app.module.ts`,
`app.config.ts`, `env.validation.ts`.

Follow the repo rules: barrel exports in the same change, aliases
(`@common/utils`, `@modules/...`) for cross-folder imports, relative imports
within `modules/auth`, no inline lint disables.

---

## 11. Testing required

### A. Unit tests (automated, no network)

Mock `OAuth2Client.verifyIdToken` in the verifier spec; mock
`GoogleTokenVerifierService`, `UsersService`, `UserCredentialsService`,
`AuthTokenService` in the `AuthService` spec (same style as
`users.service.spec.ts`).

| # | Scenario | Expected |
|---|---|---|
| 1 | Valid payload | Returns `GoogleProfile` with lowercased email, `sub` as `googleId` |
| 2 | `verifyIdToken` throws (bad signature / expired / malformed) | `UnauthorizedException`, no DB access |
| 3 | Wrong audience (mock throws the library's "Wrong recipient" error) | `UnauthorizedException` |
| 4 | `email_verified: false` or no email | `UnauthorizedException` |
| 5 | `verifyIdToken` called with `audience = googleClientId` | asserted on the mock |
| 6 | **New Google user** | `createFromGoogle` called with requested role; `startSession` called; no link call |
| 7 | **Existing Google user** | found by `findByGoogleId`; no create, no link |
| 8 | **Existing email/password user** | `linkGoogleAccount(existing.id, sub)`; no create; `passwordHash` untouched |
| 9 | Deactivated user | `ForbiddenException`, `startSession` not called |
| 10 | `role: 'admin'` in body | rejected by `GoogleLoginDto` validation (`400`) |

### B. Manual end-to-end (needs a real Google token)

Prereqs: `pnpm db:up`, `pnpm migration:run`, real `GOOGLE_CLIENT_ID` in `.env`,
`pnpm start:dev`.

**Getting a real ID token:** a tiny static HTML page (throwaway, not in the
repo) served on an **authorized JavaScript origin** (e.g.
`http://localhost:3001`) that loads `https://accounts.google.com/gsi/client`,
initializes it with **our** client ID, and `console.log`s
`response.credential` in the callback. Paste that string as `idToken`.
Tokens live ~1 hour, single-use isn't enforced, so one token can run several
of the checks below.

| # | Test | How | Expected |
|---|---|---|---|
| 1 | **New Google user** | POST token for a Google account whose email is not in `users` | `200`, `Set-Cookie` for access + refresh, body = new user; DB row has `google_id` set, `password_hash` NULL, role = buyer (or requested) |
| 2 | **Existing Google user** | POST the same token/account again | `200`; still exactly one row for that email; `last_login_at` updated |
| 3 | **Existing email/password user** | Sign up via `POST /auth/signup` with a Gmail address, then Google-login with the same address | `200`; same `id` as the signup user; `google_id` now set; `POST /auth/login` with the password **still works** |
| 4 | **Invalid token** | `idToken: "abc"`, and a real token with one character altered | `401 Invalid Google token`, no cookies, no DB change |
| 5 | **Wrong Google client** | Get a token from another OAuth client (e.g. a second client ID in Google Cloud, or Google's OAuth Playground which uses its own client) | `401 Invalid Google token` (audience mismatch); check server log for the reason |
| 6 | **Expired token** | reuse a token after ~1h | `401` |
| 7 | **Missing/empty body / bad role** | `{}`, `{"idToken":"x","role":"admin"}` | `400` validation error |
| 8 | **Deactivated account** | set `is_active=false` for the user, retry | `403` |
| 9 | **JWT works on protected APIs** | With the cookies from test 1 (`curl -c/-b cookies.txt`, like the existing `cookies3.txt` usage, or Swagger with the access token as Bearer): `GET /api/v1/auth/me`, then one existing protected route (e.g. a dashboard endpoint) | `200`, `me` returns the Google user; without cookies → `401` |
| 10 | **Refresh + logout** | `POST /auth/refresh` with cookies, then `POST /auth/logout`, then refresh again | refresh `200` (new pair), then after logout `401` |

Example curl (test 1 and 9):

```bash
curl -i -c jar.txt -X POST http://localhost:3000/api/v1/auth/google/token \
  -H "Content-Type: application/json" \
  -d '{"idToken":"<paste credential>","role":"buyer"}'

curl -b jar.txt http://localhost:3000/api/v1/auth/me
```

### C. Optional e2e (`test/`)

Like `test/users.e2e-spec.ts` but with
`.overrideProvider(GoogleTokenVerifierService).useValue({ verify: jest.fn() })`
so the full HTTP → DB → cookie → protected-route path is tested without
Google. Assert the `Set-Cookie` headers and that `GET /auth/me` succeeds with
them.

### D. Must pass before merging

```
pnpm lint && pnpm typecheck && pnpm test
```

(Per this repo's rule, don't run `pnpm format` repo-wide as a check — it
rewrites line endings across all files.)

---

## 12. Step-by-step implementation order

1. **Google Cloud (§3):** confirm/create the Web client, add JS origins, add
   test users, put the real Client ID in `.env` as `GOOGLE_CLIENT_ID`.
2. `pnpm add google-auth-library`.
3. Create `GoogleLoginDto`; export it from `dto/index.ts`.
4. Create `GoogleTokenVerifierService`; export from `services/index.ts`;
   register in `auth.module.ts`.
5. Write `google-token-verifier.service.spec.ts` (cases A1–A5); make it pass.
6. Add `AuthService.loginWithGoogleIdToken`; write `auth.service.spec.ts`
   (cases A6–A9).
7. Add `POST auth/google/token` to `AuthController` with Swagger decorators
   (`@ApiOperation`, `@ApiOkResponse({ type: User })`,
   `@ApiUnauthorizedResponse`).
8. `pnpm lint && pnpm typecheck && pnpm test`.
9. Manual end-to-end tests B1–B10 with a real token.
10. (Optional) e2e test C.
11. Update `auth.md` (endpoint reference + frontend snippet: load GSI, on
    `credential` callback `fetch(.../auth/google/token, { method: 'POST',
    credentials: 'include', body: JSON.stringify({ idToken, role }) })`).
12. Hand the frontend the Client ID and the endpoint contract.

**Rollback:** no schema change and no edits to existing behavior, so rolling
back is removing the endpoint/service and the dependency — the redirect flow
and password login are unaffected.
