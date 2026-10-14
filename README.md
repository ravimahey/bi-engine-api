# Ordara Analytics — Backend

NestJS 11 API for the Ordara analytics platform. It stores users, organizations
and accounting data (synced from QuickBooks / Xero or imported from CSV) in
PostgreSQL, and serves dashboards, records, signals and AI insights (Google
Gemini via LangChain) to
[`ordara-analytics-frontend`](../ordara-analytics-frontend).

## Stack

| Concern         | Choice                                                            |
| --------------- | ----------------------------------------------------------------- |
| Framework       | NestJS 11 (Express), TypeScript                                   |
| Database        | PostgreSQL 17 + TypeORM (migrations only)                         |
| Auth            | JWT access + refresh tokens in httpOnly cookies, Google sign-in   |
| Integrations    | QuickBooks Online (`intuit-oauth`), Xero (OAuth + webhooks)       |
| AI              | Google Gemini through `@langchain/google-genai`                   |
| File uploads    | Cloudinary (user avatars)                                         |
| Email           | Nodemailer over SMTP (password-reset OTPs)                        |
| API docs        | Swagger at `/docs`                                                |
| Package manager | pnpm                                                              |

## Prerequisites

Install these before you start:

| Tool           | Version     | Notes                                                                 |
| -------------- | ----------- | --------------------------------------------------------------------- |
| Node.js        | 24 (≥ 20)   | Same version as the frontend's `.nvmrc`. `nvm install 24`             |
| pnpm           | 10.x        | `corepack enable` (ships with Node), or `npm i -g pnpm@10`            |
| PostgreSQL     | 17          | Easiest via Docker (below), or any hosted Postgres (e.g. Supabase)    |
| Docker         | any recent  | Only needed if you run Postgres locally with `pnpm db:up`             |
| Git            | any         |                                                                       |

External accounts — only needed for the features that use them; the app boots
without them:

| Account                                                               | Used for                          |
| --------------------------------------------------------------------- | --------------------------------- |
| [Google Cloud console](https://console.cloud.google.com/apis/credentials) | "Continue with Google" sign-in |
| [Google AI Studio](https://aistudio.google.com/apikey)                | Gemini API key for AI insights    |
| [Intuit developer](https://developer.intuit.com/app/developer/dashboard) | QuickBooks connection          |
| [Xero developer](https://developer.xero.com/app/manage)               | Xero connection + webhooks        |
| [Cloudinary](https://cloudinary.com/)                                 | Avatar uploads                    |
| SMTP provider (or [Ethereal](https://ethereal.email/) for dev)        | Forgot-password emails            |

## Local ports

Both apps default to port 3000, so locally we run them like this:

| App      | URL                          |
| -------- | ---------------------------- |
| Backend  | `http://localhost:8000`      |
| API base | `http://localhost:8000/api/v1` |
| Swagger  | `http://localhost:8000/docs` |
| Health   | `http://localhost:8000/health` |
| Frontend | `http://localhost:3000`      |

The steps below use these ports. If you change them, change every URL in the
env tables to match.

## Setup from scratch

### 1. Install dependencies

```bash
cd ordara-analytics-backend
pnpm install
```

### 2. Start PostgreSQL

**Option A — Docker (recommended for local dev):**

```bash
pnpm db:up        # starts postgres:17 as container "ordara-postgres" on :5432
```

This creates database `ordara_analytics` with user/password
`postgres`/`postgres`. Data persists in the `postgres-data` volume.
`pnpm db:down` stops it.

**Option B — hosted Postgres (Supabase, RDS, ...):** create an empty database
and use its host/port/user/password in step 3. Set `DB_SSL=true` for hosted
databases.

### 3. Create `.env`

```bash
cp .env.example .env
```

Then edit `.env`. The app validates every variable at boot
(`src/config/env.validation.ts`) and refuses to start if a required one is
missing or malformed.

Generate the secrets:

```bash
# Run twice — JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be DIFFERENT
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# TOKEN_ENCRYPTION_KEY (32 bytes, encrypts QuickBooks/Xero tokens at rest)
openssl rand -hex 32
```

#### Required

| Variable             | Local value                    | Notes                                  |
| -------------------- | ------------------------------ | -------------------------------------- |
| `PORT`               | `8000`                         | `.env.example` says 3000 — change it    |
| `DB_HOST`            | `localhost`                    |                                        |
| `DB_PORT`            | `5432`                         |                                        |
| `DB_USERNAME`        | `postgres`                     |                                        |
| `DB_PASSWORD`        | `postgres`                     |                                        |
| `DB_NAME`            | `ordara_analytics`             |                                        |
| `JWT_ACCESS_SECRET`  | generated                      |                                        |
| `JWT_REFRESH_SECRET` | generated (different value)    |                                        |

#### Application

| Variable             | Local value                | Notes                                                                  |
| -------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `NODE_ENV`           | `development`              | `development` / `test` / `staging` / `production`                      |
| `API_PREFIX`         | `api`                      | Routes are `/<prefix>/v1/...`                                          |
| `FRONTEND_URL`       | `http://localhost:3000`    | Where OAuth flows redirect back to; also used in emails                |
| `CORS_ORIGINS`       | `http://localhost:3000`    | Comma-separated. Must list the frontend — cookies need credentialed CORS |
| `COOKIE_DOMAIN`      | *(blank)*                  | Blank for localhost; e.g. `.ordara.com` in staging/production           |
| `REQUEST_TIMEOUT_MS` | `30000`                    |                                                                        |
| `SWAGGER_ENABLED`    | `true`                     |                                                                        |
| `SWAGGER_PATH`       | `docs`                     |                                                                        |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | `60000` / `100` | Rate limit: requests per window (ms)                                 |

#### Database extras

| Variable            | Local value | Notes                                                          |
| ------------------- | ----------- | -------------------------------------------------------------- |
| `DB_SCHEMA`         | `public`    |                                                                |
| `DB_SSL`            | `false`     | `true` for Supabase/hosted databases                           |
| `DB_POOL_SIZE`      | `10`        |                                                                |
| `DB_LOGGING`        | `true`      | Logs SQL — handy locally, turn off in production               |
| `DB_SYNCHRONIZE`    | `false`     | Keep `false`. Schema changes go through migrations             |
| `DB_RUN_MIGRATIONS` | `false`     | `true` runs pending migrations automatically on boot           |

#### Auth / Google sign-in

| Variable                 | Local value                                            |
| ------------------------ | ------------------------------------------------------ |
| `JWT_ACCESS_EXPIRES_IN`  | `15m`                                                  |
| `JWT_REFRESH_EXPIRES_IN` | `7d`                                                   |
| `OTP_EXPIRES_MINUTES`    | `15`                                                   |
| `GOOGLE_CLIENT_ID`       | OAuth web client ID — same value as the frontend's `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| `GOOGLE_CLIENT_SECRET`   | OAuth client secret                                    |
| `GOOGLE_CALLBACK_URL`    | `http://localhost:8000/api/v1/auth/google/callback`    |

In the Google Cloud console, on the OAuth web client:
- **Authorized JavaScript origins:** `http://localhost:3000`
- **Authorized redirect URIs:** `http://localhost:8000/api/v1/auth/google/callback`

#### Email (forgot password)

| Variable    | Local value                              |
| ----------- | ---------------------------------------- |
| `SMTP_HOST` | `smtp.ethereal.email`                    |
| `SMTP_PORT` | `587`                                    |
| `SMTP_USER` | Ethereal username                        |
| `SMTP_PASS` | Ethereal password                        |
| `SMTP_FROM` | `Ordara Analytics <noreply@ordara.com>`  |

For dev, create a free inbox at [ethereal.email](https://ethereal.email/create).
Mail isn't really delivered — the backend logs a `Preview URL:` for each email
so you can read the OTP. Only the forgot-password flow sends email; sign-up
does not.

#### QuickBooks

| Variable                   | Local value                                          |
| -------------------------- | ---------------------------------------------------- |
| `QUICKBOOKS_CLIENT_ID`     | From your Intuit app's Keys & credentials            |
| `QUICKBOOKS_CLIENT_SECRET` |                                                      |
| `QUICKBOOKS_ENVIRONMENT`   | `sandbox` (or `production`)                          |
| `QUICKBOOKS_REDIRECT_URI`  | `http://localhost:8000/api/v1/quickbooks/callback`   |

Add the exact same redirect URI to the Intuit app. Note that `.env.example`
has an older `/api/quickbooks/callback` value — use the `/api/v1/` one above.

#### Xero

| Variable              | Local value                                    |
| --------------------- | ---------------------------------------------- |
| `XERO_CLIENT_ID`      | From your Xero app                             |
| `XERO_CLIENT_SECRET`  |                                                |
| `XERO_CALLBACK_URL`   | `http://localhost:8000/api/v1/xero/callback`   |
| `XERO_WEBHOOK_SECRET` | Webhooks tab of the Xero app                   |

The callback URL must be listed on the Xero app exactly as written. Xero
webhooks (`POST /api/v1/xero/webhook`) need a public HTTPS URL, so locally
they only work through a tunnel such as `ngrok http 8000`.

#### Token encryption

| Variable               | Local value                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32`. Optional locally (falls back to an all-zero key); **required** in production |

Don't change this key once QuickBooks/Xero are connected — tokens encrypted
with the old key can no longer be read and those connections must be redone.

#### Cloudinary (avatars)

`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — from
the Cloudinary dashboard. These aren't in `.env.example`; add them yourself.
Without them, everything works except avatar upload.

#### AI (Gemini)

| Variable             | Local value         | Notes                                                       |
| -------------------- | ------------------- | ----------------------------------------------------------- |
| `AI_ENABLED`         | `true`              | `false` (or a blank key) returns data without AI explanations |
| `GOOGLE_API_KEY`     | Gemini API key      | Use a paid-tier key in production                           |
| `GEMINI_MODEL`       | `gemini-3.6-flash`  |                                                             |
| `AI_TEMPERATURE`     | `0.1`               | 0–2                                                         |
| `AI_TIMEOUT_MS`      | `25000`             |                                                             |
| `AI_MAX_TOOL_ROUNDS` | `4`                 | 1–8, max model round-trips per "Ask Ordaraa" question       |

### 4. Run database migrations

```bash
pnpm migration:run      # creates every table
pnpm migration:show     # optional: [X] marks applied migrations
```

### 5. Start the API

```bash
pnpm start:dev
```

On success the log prints:

```
Environment : development
API         : http://[::1]:8000/api/v1
Swagger     : http://[::1]:8000/docs
```

Check it: open `http://localhost:8000/health` or the Swagger UI.

### 6. Create the first admin

Every sign-up gets the `owner` role. There's no admin seed, so promote one
account by hand:

1. Sign up through the frontend (or `POST /api/v1/auth/signup` in Swagger).
2. Run in Postgres:

   ```bash
   docker exec -it ordara-postgres psql -U postgres -d ordara_analytics \
     -c "UPDATE users SET role = 'admin' WHERE email = 'you@example.com';"
   ```

3. Log out and back in.

Roles: `admin` (platform-wide), `owner` (owns one organization), `support`
(access to one organization, approved by its owner).

### 7. Load data (optional)

An organization gets data by connecting QuickBooks or Xero from the frontend,
or by uploading a CSV import. To fill the duplicate-transactions feature with
demo rows:

```bash
pnpm seed:duplicates <organizationId>
```

## Scripts

| Script                                       | What it does                                            |
| -------------------------------------------- | ------------------------------------------------------- |
| `pnpm start:dev`                             | Run with watch mode                                     |
| `pnpm start:debug`                           | Watch mode + Node inspector                             |
| `pnpm build`                                 | Compile to `dist/` (resolves path aliases)              |
| `pnpm start:prod`                            | Run the compiled build (`node dist/main`)               |
| `pnpm lint`                                  | ESLint with `--fix`                                     |
| `pnpm format`                                | Prettier                                                |
| `pnpm typecheck`                             | `tsc --noEmit`                                          |
| `pnpm db:up` / `db:down`                     | Start / stop the Docker Postgres                        |
| `pnpm migration:run`                         | Apply pending migrations                                |
| `pnpm migration:revert`                      | Roll back the last migration                            |
| `pnpm migration:show`                        | List migrations and their status                        |
| `pnpm migration:generate src/database/migrations/<Name>` | New migration from entity changes          |
| `pnpm migration:create src/database/migrations/<Name>`   | Empty migration for hand-written SQL       |
| `pnpm seed:duplicates [orgId]`               | Insert demo duplicate transactions                      |
| `pnpm schema:drop`                           | **Drops every table** — local reset only                |

Reset the local database completely:

```bash
pnpm schema:drop && pnpm migration:run
```

## Project structure

```
src/
  common/       # cross-cutting: constants, decorators, dto, BaseEntity,
                # filters, guards, interceptors, types, utils
  config/       # registerAs() config factories + env validation
  database/     # DatabaseModule, TypeORM CLI data-source, migrations/, seeds/
  modules/      # one folder per feature: admin, ai, analytics, auth, dashboard,
                # health, imports, mail, organizations, providers, quickbooks,
                # records, signals, support, upload, users, walkthroughs, xero
  app.module.ts
  main.ts
```

Coding rules (folder layout, path aliases, barrels, migrations, indexing) are
in [CLAUDE.md](CLAUDE.md). Run `pnpm lint && pnpm typecheck` before pushing.

## Deployment

1. Provision Postgres and set `DB_SSL=true` if it's hosted.
2. Set every variable from step 3 with production values. In particular:
   `NODE_ENV=production`, real `TOKEN_ENCRYPTION_KEY`, new JWT secrets,
   `FRONTEND_URL` + `CORS_ORIGINS` set to the frontend's domain,
   `COOKIE_DOMAIN` set to the shared parent domain (e.g. `.ordara.com`),
   production OAuth callback URLs (also registered with Google, Intuit and Xero),
   `QUICKBOOKS_ENVIRONMENT=production`, and usually `SWAGGER_ENABLED=false`.
3. Build and migrate:

   ```bash
   pnpm install --frozen-lockfile
   pnpm build
   pnpm migration:run
   pnpm start:prod
   ```

`src/main.ts` also exports a serverless handler, so the app runs on Vercel
as-is (Vercel sets `VERCEL=1` and the app skips `listen()`).

## Troubleshooting

| Symptom                                          | Fix                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `Invalid environment configuration: ...` on boot | The listed variable is missing or malformed in `.env`               |
| `ECONNREFUSED 127.0.0.1:5432`                    | Postgres isn't running — `pnpm db:up`, then `docker ps`             |
| `relation "users" does not exist`                | Migrations haven't run — `pnpm migration:run`                       |
| Frontend gets CORS errors / login doesn't stick  | `CORS_ORIGINS` and `FRONTEND_URL` must exactly match the frontend origin |
| `EADDRINUSE :::8000`                             | Something else is on the port — stop it or change `PORT` everywhere |
| QuickBooks / Xero / Google `redirect_uri` error  | The callback in `.env` must exactly match the one registered with the provider |
| Self-signed certificate error on hosted DB       | Set `DB_SSL=true`                                                   |
