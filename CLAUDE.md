# ordara-analytics-backend — Engineering Guide

NestJS 11 + TypeORM + PostgreSQL API. This file is the standing contract for how
code is organized and written here. Follow it for every change — new module,
new endpoint, new migration, or a refactor of existing code.

## Stack

- **Framework:** NestJS 11 (Express platform)
- **DB / ORM:** PostgreSQL + TypeORM, migrations only (`synchronize` is dev-only)
- **Validation:** `class-validator` / `class-transformer`, enforced globally via `APP_PIPE`
- **Auth:** Passport (JWT access + refresh, Google OAuth), guards registered globally via `APP_GUARD`
- **Lint/format:** ESLint (flat config, typescript-eslint recommendedTypeChecked) + Prettier

Package manager is **pnpm** — use `pnpm`, not `npm`/`yarn`, for every command below.

## Folder structure

```
src/
  common/        # Cross-cutting building blocks used by 2+ modules
    constants/
    decorators/
    dto/
    entities/    # BaseEntity — shared base columns only, not domain entities
    filters/
    guards/
    interceptors/
    types/
    utils/
  config/        # registerAs() config factories + env validation, nothing domain-specific
  database/      # DatabaseModule, TypeORM CLI data-source, migrations/
  modules/       # One folder per domain/feature
    <feature>/
      constants/   # named constants for this feature — never a bare literal at a call site
      dto/
      entities/
      services/    # every @Injectable() for this feature, one class per file
      types/       # interfaces/type aliases — never declared inline in a service
      <feature>.controller.ts
      <feature>.module.ts
  app.module.ts
  main.ts
```

Every feature module puts its `@Injectable()` classes in `services/`, its
plain constants in `constants/`, and its interfaces/type aliases in `types/`
— never as a sibling file loose at the module root, and never declared inline
inside a service or controller. `<feature>.controller.ts` and
`<feature>.module.ts` are the only TypeScript files that stay directly under
the module folder; everything else lives in one of its subfolders.

### Common vs. module — how to decide

Put something in `src/common` **only** if it has no knowledge of a specific
domain and is (or clearly will be) reused by more than one module — a guard,
an interceptor, a generic pagination DTO, a base entity, a decorator. If it
mentions a domain concept (`User`, `Order`, `Invoice`, ...) it belongs inside
that feature's module folder, not in `common`, even if you think another
module might someday want it — move it to `common` when a second module
actually needs it, not before.

Inside `src/modules/<feature>`, only add a subfolder when the module needs
it — `constants/`, `dto/`, `entities/`, `guards/`, `services/`, `strategies/`,
`types/`, `utils/` as seen in `auth`, `users` and `quickbooks`. A module with
a single service and a couple of DTOs still gets `services/`/`dto/` (those
two are never skipped), but skip a subfolder that would stay empty — e.g. no
`types/` folder if the module declares no interfaces of its own.

## Path aliases — always use them across folder boundaries

`tsconfig.json` defines `@common`, `@common/*`, `@config`, `@config/*`,
`@database/*`, `@modules/*`. ESLint enforces this: `@typescript-eslint/no-restricted-imports`
blocks any `../../*` (two-or-more-level-up) relative import — a deep relative
import is a lint error, not a style nit. Rules:

- Crossing from one top-level folder into another (e.g. a module importing
  from `common`, or one module importing from another module) → always use
  the alias, never `../../`.
- Within a single feature folder → relative imports are fine and preferred
  (`./dto`, `../entities`, `../services` from inside `types/` or `constants/`).

## Barrel exports (`index.ts`)

Every folder that is imported from outside itself exports through a plain
barrel:

```ts
export * from './some-file';
```

This project does this in every subfolder of `common/` and of every feature
module — `constants/`, `decorators/`, `dto/`, `entities/`, `filters/`,
`guards/`, `interceptors/`, `services/`, `strategies/`, `types/`, `utils/`,
`config/`, etc. A module's own `<feature>.controller.ts`/`<feature>.module.ts`
are the only files imported by their exact path (they stay at the module
root, not in a subfolder, so there's nothing to barrel). When you add a file
to any subfolder, add its `export *` line to that folder's `index.ts` in the
same change — don't leave a file unreachable through the barrel, and don't
reach past a barrel with a deep path when a barrel already exists for that
folder (e.g. import `User` from `@modules/users/entities`, never
`@modules/users/entities/user.entity`).

When you create a new module or a new subfolder that other code will import
from, create its `index.ts` barrel in the same change.

## NestJS conventions

- **Controllers stay thin.** They validate via DTOs (already handled by the
  global `ValidationPipe` — `whitelist`, `forbidNonWhitelisted`, `transform`),
  call one or two service methods, and shape the HTTP response. No
  persistence logic, no business rules in a controller.
- **Services own persistence and business logic.** One `Injectable` per
  responsibility — see "Keep files small" below for when to split a service.
- **DTOs for every request boundary.** Input DTOs use `class-validator`
  decorators; never accept a raw `any`/`object` body. Reuse `common/dto`
  (`PaginationQueryDto`, `IdParamDto`, etc.) instead of redeclaring pagination
  or id-param shapes per module.
- **Entities extend `BaseEntity`** (`common/entities/base.entity.ts`) for
  `id`, `createdAt`, `updatedAt`, `deletedAt` (soft delete), `version`
  (optimistic locking) — don't redeclare these columns per entity.
- **Prefer soft delete** (`repository.softDelete()`) over hard deletes for
  domain data, matching the `users` module, unless there's a specific reason
  a row must be permanently gone.
- **Global cross-cutting concerns are already wired in `app.module.ts`**
  (logging/timeout/transform/serializer interceptors, the global
  `ValidationPipe`, throttler + JWT + roles guards, the exceptions filter).
  Add new cross-cutting behavior there as another `APP_*` provider, not as
  something every controller opts into by hand.
- **Never leak secrets over the wire.** Fields like password hashes or
  refresh tokens are `select: false` on the entity and `@Exclude()`d — follow
  that pattern for any new sensitive column, and only project them in with an
  explicit `select` (see `SECRET_FIELDS` in `modules/users/constants`) inside
  the service method that specifically needs them.

## Keep files small — break down into focused services

No god services or god controllers. When a service passes roughly **200–250
lines** or starts covering more than one responsibility (e.g. user CRUD +
password hashing + OTP handling), split it:

- Extract a focused, injectable service for the cohesive sub-responsibility
  into the module's `services/` folder (e.g. `PasswordService`/
  `UserCredentialsService` alongside `UsersService` in
  `modules/users/services/`) and inject it where needed, rather than growing
  one class further.
- A controller that's accumulated many endpoints for genuinely distinct
  sub-resources is a signal to split the module, not just the file.
- Prefer several small, well-named, single-purpose providers over one large
  one with many concerns — this also keeps unit tests focused.

## PostgreSQL, migrations, and query optimization

- **Never enable `synchronize` outside local dev.** All schema changes go
  through TypeORM migrations. `buildDatabaseOptions()` in
  `config/database.config.ts` is shared by the runtime and the CLI so both
  point at the same connection — don't hand-roll a second DB config.
- **Migration workflow** (`pnpm` scripts already defined):
  - `pnpm migration:generate src/database/migrations/<Name>` — generate from
    entity diffs after changing an entity.
  - `pnpm migration:create src/database/migrations/<Name>` — empty migration
    for manual SQL (data backfills, custom index types, etc).
  - `pnpm migration:run` / `pnpm migration:revert` / `pnpm migration:show`.
  - Every migration must have a correct, tested `down()` — never ship an
    irreversible migration without calling that out explicitly.
  - Keep migrations small and single-purpose; don't bundle unrelated schema
    changes into one migration.
- **Indexing:**
  - Add an explicit index for every column used in a `WHERE`, `ORDER BY`, or
    `JOIN` that isn't already covered by a unique constraint or the primary
    key — see `idx_users_email` in the initial migration for the pattern.
  - Composite indexes should match real query shapes (leftmost-prefix rule);
    don't add single-column indexes speculatively for columns nothing
    filters on yet.
  - Foreign key columns need an index — Postgres does not create one
    automatically the way the PK/unique constraint does.
  - For a migration that adds an index to a table that can have production
    rows, use `CREATE INDEX CONCURRENTLY` (outside the migration's implicit
    transaction) rather than a plain blocking `CREATE INDEX`.
- **Query optimization:**
  - Always paginate list endpoints (`PaginationQueryDto` / `paginate()` util,
    as in `UsersService.findAll`) — never return an unbounded `find()`.
  - Select only the columns a call site needs via `select`/`FindOptionsSelect`
    instead of pulling full entities, especially for list endpoints and for
    anything that must never expose secret columns.
  - Avoid N+1 queries: use `relations`/`leftJoinAndSelect` or a dedicated
    `QueryBuilder` query instead of looping and calling the repository per
    row.
  - Reach for TypeORM's `QueryBuilder` once a query needs joins, aggregates,
    or conditional filtering beyond what `FindOptionsWhere` expresses
    cleanly — don't force complex SQL through the simple repository API.
  - For a new or suspect query, check the plan with `EXPLAIN ANALYZE` before
    assuming an index fixed it.

## Lint & format — non-negotiable

Run these before considering any change done:

```
pnpm lint       # eslint --fix over src/apps/libs/test
pnpm format     # prettier --write
pnpm typecheck  # tsc --noEmit
```

`pnpm lint` must pass with no errors (the `no-restricted-imports` barrel/alias
rule included) before a change is finished. Don't disable an ESLint rule
inline to make a change pass — fix the code, or raise it if a rule is
genuinely wrong for the case.

## Testing

- Unit tests live beside the code as `*.spec.ts` (see
  `users.service.spec.ts`). New service logic should get one.
- `pnpm test` / `pnpm test:watch` / `pnpm test:cov` for unit tests,
  `pnpm test:e2e` for end-to-end.

## Quick command reference

```
pnpm start:dev          # dev server, watch mode
pnpm db:up               # start local postgres via docker compose
pnpm migration:generate src/database/migrations/<Name>
pnpm migration:run
pnpm lint && pnpm typecheck && pnpm test
```
