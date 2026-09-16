# ordara-analytics-backend — Engineering Guide

NestJS 11 + TypeORM + PostgreSQL. Standing contract for all code here —
new modules, endpoints, migrations, or refactors.

## Stack
NestJS 11 (Express) · PostgreSQL + TypeORM (migrations only, `synchronize`
is dev-only) · `class-validator`/`class-transformer` via global `APP_PIPE` ·
Passport JWT (access+refresh) + Google OAuth via global `APP_GUARD` ·
ESLint (flat, typescript-eslint recommendedTypeChecked) + Prettier.
Use **pnpm** for every command.

## Folder structure
```
src/
  common/        # cross-cutting only: constants, decorators, dto, entities
                 # (BaseEntity only), filters, guards, interceptors, types, utils
  config/        # registerAs() factories + env validation
  database/      # DatabaseModule, CLI data-source, migrations/
  modules/<feature>/
    constants/ dto/ entities/ services/ types/   # only as needed
    <feature>.controller.ts
    <feature>.module.ts
  app.module.ts
  main.ts
```
Only `services/` (every `@Injectable()`, one per file) and `dto/` are never
skipped. Add other subfolders only when needed; skip any that would stay
empty. Controller/module files are the only ones that stay at module root.

**common vs. module:** put something in `common` only if it's domain-agnostic
*and* already used by 2+ modules. Anything naming a domain concept (`User`,
`Invoice`, ...) stays in its module, even if "another module might need it
someday" — move it later, when that actually happens.

## Path aliases
`@common`, `@common/*`, `@config`, `@config/*`, `@database/*`, `@modules/*`.
ESLint's `no-restricted-imports` blocks any `../../` (2+ levels up) — this is
a lint error, not style. Crossing top-level folders (common↔module,
module↔module) → always alias. Within one feature folder → relative imports
are fine and preferred.

## Barrel exports
Every subfolder that's imported from outside itself gets a plain
`export * from './file'` barrel (`index.ts`). Add the export line the same
change you add the file. Import through the barrel, never a deep path
(`@modules/users/entities`, not `.../entities/user.entity`). New
module/subfolder → create its barrel in the same change.

## NestJS conventions
- **Controllers stay thin:** DTO validation (global `ValidationPipe`) → 1–2
  service calls → shape response. No persistence/business logic.
- **Services own logic/persistence.** One `Injectable` per responsibility.
- **DTOs at every request boundary** — never raw `any`/`object`. Reuse
  `common/dto` (`PaginationQueryDto`, `IdParamDto`) instead of redeclaring.
- **Entities extend `BaseEntity`** (`id`, `createdAt`, `updatedAt`,
  `deletedAt`, `version`) — don't redeclare these.
- **Prefer soft delete** (`softDelete()`) unless a row must be permanently gone.
- **Cross-cutting concerns are wired in `app.module.ts`** (interceptors,
  global pipe, guards, exception filter) — add new ones as `APP_*` providers
  there, not opt-in per controller.
- **Never leak secrets:** sensitive columns are `select: false` + `@Exclude()`
  (see `SECRET_FIELDS` in `modules/users/constants`); project them in only
  inside the specific service method that needs them.

## Keep files small
No god services/controllers. Past ~200–250 lines or 2+ responsibilities,
split out a focused service into `services/` (e.g. `PasswordService`
alongside `UsersService`). A controller with many endpoints for distinct
sub-resources signals splitting the module, not just the file.

## Postgres & migrations
- No `synchronize` outside local dev — migrations only, via the shared
  `buildDatabaseOptions()` in `config/database.config.ts`.
- `pnpm migration:generate src/database/migrations/<Name>` (from entity
  diffs) · `migration:create` (manual SQL) · `migration:run` /
  `:revert` / `:show`. Every migration needs a correct, tested `down()`.
  Keep migrations small and single-purpose.
- Index every column used in `WHERE`/`ORDER BY`/`JOIN` not already covered
  by PK/unique. FK columns need an explicit index (Postgres won't add one).
  Composite indexes follow real query shapes (leftmost-prefix), not
  speculative single-column ones.
- Adding an index to a table with production rows → `CREATE INDEX
  CONCURRENTLY`, not a blocking `CREATE INDEX`.
- Always paginate list endpoints (`paginate()`/`PaginationQueryDto`) — never
  unbounded `find()`. Select only needed columns via `FindOptionsSelect`.
  Avoid N+1 (`relations`/`leftJoinAndSelect` or `QueryBuilder`, not
  per-row loops). Use `QueryBuilder` once joins/aggregates/complex filters
  outgrow `FindOptionsWhere`. Check `EXPLAIN ANALYZE` on new/suspect queries.

## Lint & format — non-negotiable
```
pnpm lint       # must pass with no errors, including no-restricted-imports
pnpm format
pnpm typecheck
```
Never disable a rule inline to pass — fix the code, or raise it if the rule
is genuinely wrong.

## Testing
`*.spec.ts` beside the code (see `users.service.spec.ts`) — new service
logic gets one. `pnpm test` / `test:watch` / `test:cov` / `test:e2e`.

## Quick reference
```
pnpm start:dev
pnpm db:up
pnpm migration:generate src/database/migrations/<Name>
pnpm migration:run
pnpm lint && pnpm typecheck && pnpm test
```