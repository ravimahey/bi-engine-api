# NestJS Production Setup Guide

A complete, copy-paste setup for a new NestJS 11 + TypeORM (PostgreSQL) API:
typed config with boot-time validation, a global exception filter, a uniform
response envelope, DTOs, custom decorators, path aliases, and a modular folder
structure.

Every file below is taken from a working project where this setup was verified
end to end: typecheck, lint, build, unit + e2e tests, migrations, and live
requests against PostgreSQL 17.

**Versions this was built against:** Node 24, pnpm 11, NestJS 11, TypeORM 1.1,
TypeScript 5.7, PostgreSQL 17. Swap `pnpm` for `npm`/`yarn` freely.

---

## Contents

1. [What you end up with](#1-what-you-end-up-with)
2. [Scaffold and dependencies](#2-scaffold-and-dependencies)
3. [TypeScript and build config](#3-typescript-and-build-config)
4. [Path aliases](#4-path-aliases)
5. [package.json scripts](#5-packagejson-scripts)
6. [ESLint](#6-eslint)
7. [Folder structure](#7-folder-structure)
8. [Config layer](#8-config-layer)
9. [Common layer](#9-common-layer)
10. [Database layer](#10-database-layer)
11. [Bootstrap and root module](#11-bootstrap-and-root-module)
12. [Health module](#12-health-module)
13. [Environment and Docker](#13-environment-and-docker)
14. [First migration](#14-first-migration)
15. [Verification checklist](#15-verification-checklist)
16. [Reference feature module (users)](#16-reference-feature-module-users)
17. [Recipes](#17-recipes)
18. [Design decisions and gotchas](#18-design-decisions-and-gotchas)

---

## 1. What you end up with

| Concern | How it is handled |
| --- | --- |
| Configuration | `@nestjs/config` with namespaced `registerAs` factories, validated by `class-validator` at boot — the process refuses to start on a bad/missing var |
| Database | TypeORM via `forRootAsync` fed from `ConfigService`, `autoLoadEntities`, `synchronize` off everywhere, migrations only |
| Errors | One global `AllExceptionsFilter` producing a single JSON error shape; Postgres error codes mapped to real HTTP statuses |
| Validation | Global `ValidationPipe` (whitelist + reject unknown + transform) with a custom exception factory producing field-keyed errors |
| Responses | `TransformInterceptor` wraps every success in a consistent envelope; pagination metadata hoisted automatically |
| Entities | `BaseEntity` with uuid PK, timestamps, soft delete, optimistic-lock version |
| Security | helmet, CORS, compression, rate limiting, URI versioning, graceful shutdown |
| Observability | Per-request correlation id + `LoggingInterceptor`, `/health` probe (DB + heap) |
| Docs | Swagger at `/docs` with a paginated-response decorator |
| Imports | `@common` / `@config` / `@database` / `@modules` aliases, enforced by lint |

### Two ways to use this guide

**Fast path** — copy these from an existing project and skip to
[section 15](#15-verification-checklist):

```
src/common/     src/config/     src/database/
src/main.ts     src/app.module.ts
tsconfig.json   tsconfig.build.json   eslint.config.mjs
package.json (scripts + jest blocks)   .env.example   docker-compose.yml
```

**Slow path** — follow sections 2-14 in order.

---

## 2. Scaffold and dependencies

```bash
pnpm dlx @nestjs/cli new myapp --package-manager pnpm --strict
cd myapp

# The default scaffold's demo controller/service are replaced by real modules.
rm src/app.controller.ts src/app.service.ts src/app.controller.spec.ts test/app.e2e-spec.ts
```

Runtime dependencies:

```bash
pnpm add @nestjs/config @nestjs/typeorm typeorm pg \
         class-validator class-transformer \
         @nestjs/swagger @nestjs/terminus @nestjs/throttler \
         helmet compression dotenv
```

| Package | Why |
| --- | --- |
| `@nestjs/config` | env loading + namespaced config |
| `@nestjs/typeorm`, `typeorm`, `pg` | ORM + Postgres driver (swap `pg` for `mysql2` etc. if needed) |
| `class-validator`, `class-transformer` | DTO validation, env validation, serialization |
| `@nestjs/swagger` | OpenAPI docs |
| `@nestjs/terminus` | health checks |
| `@nestjs/throttler` | rate limiting |
| `helmet`, `compression` | security headers, gzip |
| `dotenv` | the TypeORM CLI boots outside Nest and loads `.env` itself |

Dev dependencies:

```bash
pnpm add -D @types/compression tsc-alias cross-env
```

`tsc-alias` rewrites path aliases in the build output; `cross-env` keeps the
`NODE_OPTIONS` scripts working on Windows.

> **pnpm 10+ note:** blocked postinstall scripts stop `pnpm install`. If you see
> `ERR_PNPM_IGNORED_BUILDS`, either run `pnpm approve-builds` or declare them in
> `pnpm-workspace.yaml`:
>
> ```yaml
> allowBuilds:
>   "@scarf/scarf": false   # telemetry-only postinstall
> ```

---

## 3. TypeScript and build config

Stricter than the default scaffold: `noImplicitAny`, `strictBindCallApply`,
`noUnusedLocals`/`noUnusedParameters` and `noImplicitOverride` are all on.


**`tsconfig.json`**

Note `baseUrl` is `./src` — every `paths` entry is relative to it.

```jsonc
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2023",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./src",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "paths": {
      "@common": [
        "common"
      ],
      "@common/*": [
        "common/*"
      ],
      "@config": [
        "config"
      ],
      "@config/*": [
        "config/*"
      ],
      "@database/*": [
        "database/*"
      ],
      "@modules/*": [
        "modules/*"
      ]
    }
  }
}
```

**`tsconfig.build.json`**

```jsonc
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

**`nest-cli.json`**

```jsonc
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

---

## 4. Path aliases

Cross-boundary imports use aliases instead of `../../../`:

| Alias | Resolves to | Example |
| --- | --- | --- |
| `@common` | `src/common` (barrel) | `import { paginate } from '@common';` |
| `@common/*` | `src/common/*` | `import { IdParamDto } from '@common/dto';` |
| `@config` | `src/config` (barrel) | `import { appConfig } from '@config';` |
| `@config/*` | `src/config/*` | `import { setupSwagger } from '@config/swagger.config';` |
| `@database/*` | `src/database/*` | `import { DatabaseModule } from '@database/database.module';` |
| `@modules/*` | `src/modules/*` | `import { UsersModule } from '@modules/users/users.module';` |

**Convention:** use an alias whenever an import leaves its top-level area; keep
relative imports (`./x`, `../x`) *within* one area. Inside `modules/users/`,
`./users.service` stays relative. A lint rule (section 6) rejects `../../`.

### Four toolchains must agree

This is the part that bites. Each resolves aliases differently:

| Where | Mechanism |
| --- | --- |
| Type-check / IDE | `paths` in `tsconfig.json` |
| `pnpm build` | `tsc-alias` rewrites aliases in `dist/` to relative paths |
| `pnpm start:dev` | `NODE_OPTIONS=-r tsconfig-paths/register` + `TS_NODE_BASEURL=./dist` |
| Jest | `moduleNameMapper` in `package.json` **and** `test/jest-e2e.json` |
| TypeORM CLI | `ts-node/register` **then** `tsconfig-paths/register`, in that order |

Why `tsc-alias` for build but a runtime resolver for dev:

- **Build** — rewriting means `dist/` is self-contained. `pnpm start:prod` is a
  plain `node dist/main`, with no resolver or `tsconfig.json` needed in the
  production image.
- **Dev** — `nest start --watch` relaunches the app the moment `tsc` emits, which
  races a `tsc-alias --watch` rewrite and causes intermittent `MODULE_NOT_FOUND`.
  Resolving at require time has no such race.

> **Gotcha:** map bare aliases to the *directory* (`"@common": ["common"]`), not
> to `common/index.ts`. Pointing at the file makes `tsc-alias` emit
> `require("./common/index.ts")` into `dist`, which fails at runtime.

> **Gotcha:** `nest start` spawns its binary with fixed arguments, so you cannot
> inject `-r` via `--exec`. `NODE_OPTIONS` is the only hook.

To guard against these four drifting apart, keep this spec:


**`src/path-aliases.spec.ts`**

```ts
import { BaseEntity, buildPaginationMeta, IS_PUBLIC_KEY } from '@common';
import { APP_CONFIG_KEY, Environment } from '@config';
import { User } from '@modules/users/entities/user.entity';

/**
 * Guards the alias configuration: tsconfig `paths`, jest `moduleNameMapper` and
 * tsc-alias all have to agree, and this fails loudly if one drifts.
 */
describe('path aliases', () => {
  it('resolves @common, @config and @modules', () => {
    expect(IS_PUBLIC_KEY).toBe('isPublic');
    expect(APP_CONFIG_KEY).toBe('app');
    expect(Environment.Development).toBe('development');
    expect(buildPaginationMeta(10, 1, 5).totalPages).toBe(2);
    expect(new User()).toBeInstanceOf(BaseEntity);
  });
});
```

---

## 5. package.json scripts

```json
{
  "build": "nest build && tsc-alias -p tsconfig.build.json",
  "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
  "start": "cross-env NODE_OPTIONS=\"-r tsconfig-paths/register\" TS_NODE_BASEURL=./dist nest start",
  "start:dev": "cross-env NODE_OPTIONS=\"-r tsconfig-paths/register\" TS_NODE_BASEURL=./dist nest start --watch",
  "start:debug": "cross-env NODE_OPTIONS=\"-r tsconfig-paths/register\" TS_NODE_BASEURL=./dist nest start --debug --watch",
  "start:prod": "node dist/main",
  "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
  "test": "jest",
  "test:watch": "jest --watch",
  "test:cov": "jest --coverage",
  "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
  "test:e2e": "jest --config ./test/jest-e2e.json",
  "typeorm": "node -r ts-node/register -r tsconfig-paths/register ./node_modules/typeorm/cli.js -d src/database/data-source.ts",
  "migration:generate": "pnpm typeorm migration:generate",
  "migration:create": "typeorm-ts-node-commonjs migration:create",
  "migration:run": "pnpm typeorm migration:run",
  "migration:revert": "pnpm typeorm migration:revert",
  "migration:show": "pnpm typeorm migration:show",
  "schema:drop": "pnpm typeorm schema:drop",
  "db:up": "docker compose up -d postgres",
  "db:down": "docker compose down",
  "typecheck": "tsc --noEmit"
}
```

And the Jest block (note `rootDir` is `src`, so mapped paths are not `src`-prefixed):

```json
{
  "moduleFileExtensions": [
    "js",
    "json",
    "ts"
  ],
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "collectCoverageFrom": [
    "**/*.(t|j)s"
  ],
  "coverageDirectory": "../coverage",
  "testEnvironment": "node",
  "moduleNameMapper": {
    "^@common$": "<rootDir>/common/index.ts",
    "^@common/(.*)$": "<rootDir>/common/$1",
    "^@config$": "<rootDir>/config/index.ts",
    "^@config/(.*)$": "<rootDir>/config/$1",
    "^@database/(.*)$": "<rootDir>/database/$1",
    "^@modules/(.*)$": "<rootDir>/modules/$1"
  }
}
```

---

## 6. ESLint

Adds a rule that enforces the alias convention from section 4.


**`eslint.config.mjs`**

```js
// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // Cross-boundary imports must use @common / @config / @database / @modules.
      // Relative imports stay allowed within a single folder (./x, ../x).
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../*'],
              message:
                'Use a path alias (@common, @config, @database, @modules) instead of a deep relative import.',
            },
          ],
        },
      ],
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
```

**`.prettierrc`**

```json
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

---

## 7. Folder structure

```
src/
├── main.ts                  bootstrap: helmet, cors, compression, prefix, versioning, swagger
├── app.module.ts            root wiring — global pipe/filter/guard/interceptors live here
│
├── config/                  typed, validated configuration
│   ├── env.validation.ts    class-validator schema for .env
│   ├── app.config.ts        registerAs('app')
│   ├── database.config.ts   registerAs('database') — shared with the TypeORM CLI
│   ├── swagger.config.ts    OpenAPI document setup
│   └── index.ts             barrel -> @config
│
├── database/
│   ├── database.module.ts   TypeOrmModule.forRootAsync fed from ConfigService
│   ├── data-source.ts       entrypoint for the TypeORM CLI
│   └── migrations/
│
├── common/                  cross-cutting building blocks
│   ├── constants/           metadata keys, pagination defaults, PG error codes
│   ├── decorators/          @Public @Roles @ResponseMessage @CurrentUser @RequestId @ApiPaginatedResponse
│   ├── dto/                 PaginationQueryDto, IdParamDto, PaginationMetaDto
│   ├── entities/            BaseEntity
│   ├── filters/             AllExceptionsFilter + validationExceptionFactory
│   ├── interceptors/        Transform, Logging, Timeout
│   ├── interfaces/          response contracts
│   ├── utils/               paginate()
│   └── index.ts             barrel -> @common
│
└── modules/                 one folder per feature
    ├── health/
    └── <feature>/
        ├── dto/
        ├── entities/
        ├── <feature>.controller.ts
        ├── <feature>.service.ts
        └── <feature>.module.ts
```

**Rule of thumb:** a feature owns everything it needs inside `modules/<feature>/`.
Anything used by two or more features moves into `common/`. Modules talk to each
other by importing the other module and injecting its exported service — never by
reaching into another module's files.

> `common/` must never import from `modules/`. That is why `@Roles` takes
> `string[]` rather than a feature enum — otherwise the `@common` barrel becomes a
> circular-import hazard.

```bash
mkdir -p src/common/{constants,decorators,dto,entities,filters,interceptors,interfaces,utils} \
         src/config src/database/migrations src/modules/health
```

---

## 8. Config layer

Environment variables are declared once, validated at boot, and consumed through
typed `registerAs` namespaces. Nothing in the app reads `process.env` directly
except these files.


**`src/config/env.validation.ts`**

Add every new variable here first. A missing or malformed value fails the boot with a readable list.

```ts
import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

const toBoolean = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string')
      return ['true', '1', 'yes'].includes(value.toLowerCase());
    return value;
  });

/**
 * Single source of truth for every environment variable the app consumes.
 * Validated once at boot — the process refuses to start on a bad/missing value
 * instead of failing later at runtime.
 */
export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  API_PREFIX: string = 'api';

  @IsString()
  @IsOptional()
  CORS_ORIGINS: string = '*';

  // ---------------------------------------------------------------- database
  @IsString()
  DB_HOST: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  DB_PORT: number = 5432;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_NAME: string;

  @IsString()
  @IsOptional()
  DB_SCHEMA: string = 'public';

  @IsBoolean()
  @IsOptional()
  @toBoolean()
  DB_SYNCHRONIZE: boolean = false;

  @IsBoolean()
  @IsOptional()
  @toBoolean()
  DB_LOGGING: boolean = false;

  @IsBoolean()
  @IsOptional()
  @toBoolean()
  DB_SSL: boolean = false;

  @IsBoolean()
  @IsOptional()
  @toBoolean()
  DB_RUN_MIGRATIONS: boolean = false;

  @IsInt()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  DB_POOL_SIZE: number = 10;

  // ------------------------------------------------------------------- misc
  @IsString()
  @IsOptional()
  @MinLength(1)
  SWAGGER_PATH: string = 'docs';

  @IsBoolean()
  @IsOptional()
  @toBoolean()
  SWAGGER_ENABLED: boolean = true;

  @IsInt()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  THROTTLE_TTL: number = 60000;

  @IsInt()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  THROTTLE_LIMIT: number = 100;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return validated;
}
```

**`src/config/app.config.ts`**

```ts
import { registerAs } from '@nestjs/config';
import { Environment } from './env.validation';

export interface AppConfig {
  env: Environment;
  port: number;
  apiPrefix: string;
  corsOrigins: string[] | boolean;
  requestTimeoutMs: number;
  throttle: { ttl: number; limit: number };
  swagger: { enabled: boolean; path: string };
  isProduction: boolean;
}

export const APP_CONFIG_KEY = 'app';

export default registerAs(APP_CONFIG_KEY, (): AppConfig => {
  const env = (process.env.NODE_ENV as Environment) ?? Environment.Development;
  const rawOrigins = process.env.CORS_ORIGINS ?? '*';

  return {
    env,
    port: parseInt(process.env.PORT ?? '3000', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    corsOrigins:
      rawOrigins === '*'
        ? true
        : rawOrigins
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean),
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS ?? '30000', 10),
    throttle: {
      ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
      limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
    },
    swagger: {
      enabled: (process.env.SWAGGER_ENABLED ?? 'true') !== 'false',
      path: process.env.SWAGGER_PATH ?? 'docs',
    },
    isProduction: env === Environment.Production,
  };
});
```

**`src/config/database.config.ts`**

`buildDatabaseOptions()` is deliberately exported: the Nest runtime **and** the TypeORM CLI both call it, so migrations can never drift from the app connection.

```ts
import { registerAs } from '@nestjs/config';
import { join } from 'node:path';
import type { PostgresDataSourceOptions } from 'typeorm/driver/postgres/PostgresDataSourceOptions';

export const DATABASE_CONFIG_KEY = 'database';

const asBool = (value: string | undefined, fallback = false): boolean =>
  value === undefined
    ? fallback
    : ['true', '1', 'yes'].includes(value.toLowerCase());

/**
 * Shared by the Nest runtime (TypeOrmModule) and the TypeORM CLI
 * (src/database/data-source.ts) so migrations always run against the same
 * connection settings the app uses.
 */
export const buildDatabaseOptions = (): PostgresDataSourceOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'myapp',
  schema: process.env.DB_SCHEMA ?? 'public',
  poolSize: parseInt(process.env.DB_POOL_SIZE ?? '10', 10),

  // Entities/migrations are globbed from disk so the CLI resolves them the same
  // way the app does. At runtime Nest also autoloads entities per-module.
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, '..', 'database', 'migrations', '*.{ts,js}')],
  migrationsTableName: 'migrations',
  migrationsTransactionMode: 'each',

  // NEVER enable synchronize outside local development — it can drop columns.
  synchronize: asBool(process.env.DB_SYNCHRONIZE, false),
  migrationsRun: asBool(process.env.DB_RUN_MIGRATIONS, false),
  logging: asBool(process.env.DB_LOGGING, false)
    ? ['query', 'error', 'warn']
    : ['error'],
  ssl: asBool(process.env.DB_SSL, false)
    ? { rejectUnauthorized: false }
    : false,
});

export default registerAs(DATABASE_CONFIG_KEY, buildDatabaseOptions);
```

**`src/config/swagger.config.ts`**

```ts
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { AppConfig } from './app.config';

export const setupSwagger = (
  app: INestApplication,
  config: AppConfig,
): void => {
  if (!config.swagger.enabled) return;

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('API')
      .setDescription('REST API')
      .setVersion('1.0')
      // Global prefix + versioning are already baked into the generated paths,
      // so no .addServer() here — it would double up as /api/api/v1/...
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build(),
    { operationIdFactory: (_controllerKey, methodKey) => methodKey },
  );

  SwaggerModule.setup(config.swagger.path, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'API Docs',
  });
};
```

**`src/config/index.ts`**

```ts
export { default as appConfig, APP_CONFIG_KEY } from './app.config';
export type { AppConfig } from './app.config';
export {
  default as databaseConfig,
  DATABASE_CONFIG_KEY,
  buildDatabaseOptions,
} from './database.config';
export {
  Environment,
  EnvironmentVariables,
  validateEnv,
} from './env.validation';
```

---

## 9. Common layer

### 9.1 Constants and response contracts


**`src/common/constants/app.constants.ts`**

```ts
/** Metadata keys used by custom decorators + the guards/interceptors reading them. */
export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const RESPONSE_MESSAGE_KEY = 'responseMessage';

/** Header carrying a per-request correlation id through logs and responses. */
export const REQUEST_ID_HEADER = 'x-request-id';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Postgres error codes worth mapping to meaningful HTTP statuses. */
export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  INVALID_TEXT_REPRESENTATION: '22P02',
} as const;
```

**`src/common/interfaces/api-response.interface.ts`**

```ts
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/** Shape returned by services that page their results. */
export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface SuccessResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta;
  timestamp: string;
  path: string;
  requestId?: string;
}

export interface ErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  error: string;
  /** Field-level details, present for validation failures. */
  details?: Record<string, string[]> | string[];
  timestamp: string;
  path: string;
  requestId?: string;
  stack?: string;
}

export const isPaginated = <T>(value: unknown): value is Paginated<T> =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as Paginated<T>).items) &&
  typeof (value as Paginated<T>).meta === 'object' &&
  (value as Paginated<T>).meta !== null &&
  typeof (value as Paginated<T>).meta.total === 'number';
```

### 9.2 Base entity

Every table inherits uuid PK, audit timestamps, soft delete and a version column.
`deletedAt` and `version` are `@Exclude()`d so they never reach clients.


**`src/common/entities/base.entity.ts`**

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

/**
 * Every table inherits these columns: uuid primary key, audit timestamps,
 * soft-delete support and an optimistic-locking version.
 * Extend it instead of redeclaring the same five columns per entity.
 */
export abstract class BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  /** Set by `repository.softDelete()`; rows with a value are filtered out of finds. */
  @Exclude()
  @DeleteDateColumn({
    type: 'timestamptz',
    name: 'deleted_at',
    nullable: true,
    select: false,
  })
  deletedAt: Date | null;

  /** Optimistic locking counter — internal, never serialized to clients. */
  @Exclude()
  @VersionColumn({ default: 1 })
  version: number;
}
```

### 9.3 Shared DTOs and pagination

`PaginationQueryDto` is the base class every list endpoint extends.


**`src/common/dto/pagination-query.dto.ts`**

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
} from '../constants/app.constants';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

/** Extend this in feature DTOs to inherit consistent paging/sorting/search. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: DEFAULT_PAGE })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_LIMIT,
    default: DEFAULT_LIMIT,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT;

  @ApiPropertyOptional({ description: 'Free-text search term' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(SortOrder)
  order: SortOrder = SortOrder.DESC;

  /** Offset for `repository.findAndCount({ skip, take })`. */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
```

**`src/common/dto/id-param.dto.ts`**

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Use on routes with a `:id` uuid path param: `@Param() { id }: IdParamDto`. */
export class IdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'id must be a valid UUID' })
  id: string;
}
```

**`src/common/dto/pagination-meta.dto.ts`**

```ts
import { ApiProperty } from '@nestjs/swagger';

/** Swagger-only mirror of `PaginationMeta` so it renders in the docs. */
export class PaginationMetaDto {
  @ApiProperty({ example: 137 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 7 })
  totalPages: number;

  @ApiProperty({ example: false })
  hasPreviousPage: boolean;

  @ApiProperty({ example: true })
  hasNextPage: boolean;
}
```

**`src/common/dto/index.ts`**

```ts
export { PaginationQueryDto, SortOrder } from './pagination-query.dto';
export { IdParamDto } from './id-param.dto';
export { PaginationMetaDto } from './pagination-meta.dto';
```

**`src/common/utils/pagination.util.ts`**

```ts
import type {
  Paginated,
  PaginationMeta,
} from '../interfaces/api-response.interface';

export const buildPaginationMeta = (
  total: number,
  page: number,
  limit: number,
): PaginationMeta => {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    total,
    page,
    limit,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
};

/** Wraps a TypeORM `findAndCount()` tuple into the paginated service contract. */
export const paginate = <T>(
  [items, total]: [T[], number],
  page: number,
  limit: number,
): Paginated<T> => ({
  items,
  meta: buildPaginationMeta(total, page, limit),
});
```

### 9.4 Custom decorators


**`src/common/decorators/public.decorator.ts`**

```ts
import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../constants/app.constants';

/**
 * Marks a route as unauthenticated. Read via `Reflector` inside an auth guard:
 *
 *   const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
 *     context.getHandler(), context.getClass(),
 *   ]);
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

**`src/common/decorators/roles.decorator.ts`**

```ts
import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../constants/app.constants';

/**
 * `@Roles(UserRole.ADMIN)` — consumed by a RolesGuard via `Reflector`.
 *
 * Typed as `string` rather than a feature-specific enum so that `common/` never
 * depends on `modules/`; string enums still pass with full type-checking.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

**`src/common/decorators/response-message.decorator.ts`**

```ts
import { SetMetadata } from '@nestjs/common';
import { RESPONSE_MESSAGE_KEY } from '../constants/app.constants';

/**
 * Overrides the default success message in the response envelope:
 * `@ResponseMessage('User created successfully')`
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
```

**`src/common/decorators/current-user.decorator.ts`**

```ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Pulls the authenticated principal (set by an auth guard/strategy) off the request.
 *
 *   findMe(@CurrentUser() user: AuthenticatedUser) {}
 *   findMyId(@CurrentUser('id') id: string) {}
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
```

**`src/common/decorators/request-id.decorator.ts`**

```ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { REQUEST_ID_HEADER } from '../constants/app.constants';

/** Correlation id for the current request, useful for logging inside services. */
export const RequestId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return (request.headers[REQUEST_ID_HEADER] as string) ?? '';
  },
);
```

**`src/common/decorators/api-paginated-response.decorator.ts`**

```ts
import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginationMetaDto } from '../dto/pagination-meta.dto';

/**
 * Documents the paginated success envelope produced by TransformInterceptor:
 * `{ success, statusCode, message, data: Model[], meta }`.
 */
export const ApiPaginatedResponse = <TModel extends Type<unknown>>(
  model: TModel,
  description = 'Paginated list',
) =>
  applyDecorators(
    ApiExtraModels(model, PaginationMetaDto),
    ApiOkResponse({
      description,
      schema: {
        allOf: [
          {
            properties: {
              success: { type: 'boolean', example: true },
              statusCode: { type: 'number', example: 200 },
              message: { type: 'string', example: 'Success' },
              data: { type: 'array', items: { $ref: getSchemaPath(model) } },
              meta: { $ref: getSchemaPath(PaginationMetaDto) },
              timestamp: { type: 'string', format: 'date-time' },
              path: { type: 'string' },
            },
          },
        ],
      },
    }),
  );
```

**`src/common/decorators/index.ts`**

```ts
export { Public } from './public.decorator';
export { Roles } from './roles.decorator';
export { ResponseMessage } from './response-message.decorator';
export { CurrentUser } from './current-user.decorator';
export type { AuthenticatedUser } from './current-user.decorator';
export { RequestId } from './request-id.decorator';
export { ApiPaginatedResponse } from './api-paginated-response.decorator';
```

### 9.5 Exception filter

Every failure — a thrown `HttpException`, a TypeORM error, or an unexpected crash
— leaves the app through one filter in one shape:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": { "email": ["email must be a valid email address"] },
  "timestamp": "2026-01-01T12:00:00.000Z",
  "path": "/api/v1/users",
  "requestId": "..."
}
```

| Thrown | Status | Notes |
| --- | --- | --- |
| `NotFoundException` etc. | as-is | message preserved |
| Validation failure | 400 | `details` keyed by field path |
| Postgres `23505` unique violation | 409 | catches races a service-level check misses |
| Postgres `23503` foreign key violation | 409 | |
| Postgres `23502` / `23514` / `22P02` | 400 | |
| `EntityNotFoundError` | 404 | |
| Anything else | 500 | message hidden in production |

Stack traces are attached only when `NODE_ENV !== production`.


**`src/common/filters/all-exceptions.filter.ts`**

```ts
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request, Response } from 'express';
import { EntityNotFoundError, QueryFailedError, TypeORMError } from 'typeorm';
import { PG_ERROR_CODES, REQUEST_ID_HEADER } from '../constants/app.constants';
import type { ErrorResponse } from '../interfaces/api-response.interface';

/** Numeric copy of the enum member so status comparisons stay type-safe. */
const SERVER_ERROR_THRESHOLD: number = HttpStatus.INTERNAL_SERVER_ERROR;

interface NormalizedError {
  status: number;
  message: string;
  error: string;
  details?: Record<string, string[]> | string[];
}

interface DriverError extends Error {
  code?: string;
  detail?: string;
  constraint?: string;
  column?: string;
  table?: string;
}

/**
 * Single global catch-all. Every error leaving the app — thrown HttpException,
 * TypeORM failure, or an unexpected crash — exits through here as one JSON shape.
 * Registered in AppModule via APP_FILTER so it also covers guards/interceptors.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly isProduction: boolean,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const normalized = this.normalize(exception);
    const requestId = request.headers?.[REQUEST_ID_HEADER] as
      string | undefined;

    const body: ErrorResponse = {
      success: false,
      statusCode: normalized.status,
      message: normalized.message,
      error: normalized.error,
      ...(normalized.details ? { details: normalized.details } : {}),
      timestamp: new Date().toISOString(),
      path:
        (httpAdapter.getRequestUrl(request) as string | undefined) ??
        request.url,
      ...(requestId ? { requestId } : {}),
      // Stack traces are a leak in production; keep them for local debugging only.
      ...(!this.isProduction && exception instanceof Error
        ? { stack: exception.stack }
        : {}),
    };

    this.log(exception, body, request);
    httpAdapter.reply(response, body, normalized.status);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException)
      return this.fromHttpException(exception);
    if (exception instanceof QueryFailedError)
      return this.fromQueryFailed(
        exception.driverError as DriverError,
        exception.message,
      );
    if (exception instanceof EntityNotFoundError) {
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'The requested resource was not found',
        error: 'Not Found',
      };
    }
    if (exception instanceof TypeORMError) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: this.isProduction
          ? 'A database error occurred'
          : exception.message,
        error: 'Database Error',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        this.isProduction || !(exception instanceof Error)
          ? 'Internal server error'
          : exception.message,
      error: 'Internal Server Error',
    };
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { status, message: payload, error: exception.name };
    }

    const record = payload as Record<string, unknown>;
    const rawMessage = record.message;

    // ValidationPipe hands us `message: string[]`; our custom exception factory
    // upgrades that to a field-keyed `details` map (see validation-exception.factory).
    const details = (record.details ??
      (Array.isArray(rawMessage) ? rawMessage : undefined)) as
      Record<string, string[]> | string[] | undefined;

    const message = Array.isArray(rawMessage)
      ? 'Validation failed'
      : ((rawMessage as string) ?? exception.message);

    return {
      status,
      message,
      error: (record.error as string) ?? exception.name,
      details,
    };
  }

  private fromQueryFailed(
    driverError: DriverError,
    rawMessage: string,
  ): NormalizedError {
    switch (driverError?.code) {
      case PG_ERROR_CODES.UNIQUE_VIOLATION:
        return {
          status: HttpStatus.CONFLICT,
          message: 'A record with these values already exists',
          error: 'Conflict',
          details: driverError.constraint
            ? [driverError.constraint]
            : undefined,
        };
      case PG_ERROR_CODES.FOREIGN_KEY_VIOLATION:
        return {
          status: HttpStatus.CONFLICT,
          message: 'Operation violates a relation constraint',
          error: 'Conflict',
        };
      case PG_ERROR_CODES.NOT_NULL_VIOLATION:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: `Field "${driverError.column ?? 'unknown'}" is required`,
          error: 'Bad Request',
        };
      case PG_ERROR_CODES.CHECK_VIOLATION:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'A value failed a database check constraint',
          error: 'Bad Request',
        };
      case PG_ERROR_CODES.INVALID_TEXT_REPRESENTATION:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Malformed value supplied for one of the fields',
          error: 'Bad Request',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: this.isProduction ? 'A database error occurred' : rawMessage,
          error: 'Database Error',
        };
    }
  }

  private log(exception: unknown, body: ErrorResponse, request: Request): void {
    const context = `${request.method} ${body.path}${body.requestId ? ` [${body.requestId}]` : ''}`;

    if (body.statusCode >= SERVER_ERROR_THRESHOLD) {
      this.logger.error(
        `${context} -> ${body.statusCode} ${body.message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }

    this.logger.warn(`${context} -> ${body.statusCode} ${body.message}`);
  }
}
```

**`src/common/filters/validation-exception.factory.ts`**

Turns the nested `class-validator` error tree into a flat `{ field: [messages] }` map so clients can bind errors to inputs.

```ts
import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/**
 * Turns class-validator's nested error tree into a flat `{ field: [messages] }`
 * map so clients can bind errors to inputs instead of parsing strings.
 */
const flatten = (
  errors: ValidationError[],
  parentPath = '',
  acc: Record<string, string[]> = {},
): Record<string, string[]> => {
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (error.constraints) {
      acc[path] = [...(acc[path] ?? []), ...Object.values(error.constraints)];
    }

    if (error.children?.length) {
      flatten(error.children, path, acc);
    }
  }

  return acc;
};

export const validationExceptionFactory = (errors: ValidationError[]) =>
  new BadRequestException({
    statusCode: 400,
    message: 'Validation failed',
    error: 'Bad Request',
    details: flatten(errors),
  });
```

**`src/common/filters/index.ts`**

```ts
export { AllExceptionsFilter } from './all-exceptions.filter';
export { validationExceptionFactory } from './validation-exception.factory';
```

### 9.6 Interceptors

Controllers return plain entities/DTOs; `TransformInterceptor` wraps them:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Users fetched successfully",
  "data": [ ... ],
  "meta": { "total": 45, "page": 1, "limit": 20, "totalPages": 3,
            "hasPreviousPage": false, "hasNextPage": true },
  "timestamp": "2026-01-01T12:00:00.000Z",
  "path": "/api/v1/users",
  "requestId": "..."
}
```

`meta` appears only when the service returns `Paginated<T>` via the `paginate()`
helper. Override the message with `@ResponseMessage('...')`.


**`src/common/interceptors/transform.interceptor.ts`**

```ts
import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { map, type Observable } from 'rxjs';
import {
  RESPONSE_MESSAGE_KEY,
  REQUEST_ID_HEADER,
} from '../constants/app.constants';
import {
  isPaginated,
  type SuccessResponse,
} from '../interfaces/api-response.interface';

/**
 * Wraps every successful handler return value in the standard envelope, so
 * controllers stay free to return plain entities/DTOs.
 * Paginated services return `{ items, meta }` — meta is hoisted next to data.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  SuccessResponse<unknown>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'Success';

    return next.handle().pipe(
      map((payload) => {
        const statusCode = response.statusCode ?? HttpStatus.OK;
        const requestId = request.headers?.[REQUEST_ID_HEADER] as
          string | undefined;

        const base = {
          success: true as const,
          statusCode,
          message,
          timestamp: new Date().toISOString(),
          path: request.url,
          ...(requestId ? { requestId } : {}),
        };

        return isPaginated(payload)
          ? { ...base, data: payload.items, meta: payload.meta }
          : { ...base, data: payload ?? null };
      }),
    );
  }
}
```

**`src/common/interceptors/logging.interceptor.ts`**

Assigns/propagates an `x-request-id` and logs method, path, status and duration. Failures are logged by the exception filter instead, to avoid double logging.

```ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { tap, type Observable } from 'rxjs';
import { REQUEST_ID_HEADER } from '../constants/app.constants';

/**
 * Assigns/propagates a request id and logs method, path, status and duration.
 * The id is echoed on the response header so clients can quote it in bug reports.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const requestId =
      (request.headers[REQUEST_ID_HEADER] as string) ?? randomUUID();
    request.headers[REQUEST_ID_HEADER] = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    const { method, url } = request;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log(
            `${method} ${url} ${response.statusCode} +${Date.now() - startedAt}ms [${requestId}]`,
          ),
        // Failures are logged with full context by AllExceptionsFilter.
        error: () => undefined,
      }),
    );
  }
}
```

**`src/common/interceptors/timeout.interceptor.ts`**

```ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  RequestTimeoutException,
  type NestInterceptor,
} from '@nestjs/common';
import {
  catchError,
  throwError,
  timeout,
  TimeoutError,
  type Observable,
} from 'rxjs';

/** Fails slow handlers with 408 instead of letting sockets hang. */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeoutMs: number) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof TimeoutError
            ? new RequestTimeoutException('Request took too long to process')
            : error,
        ),
      ),
    );
  }
}
```

**`src/common/interceptors/index.ts`**

```ts
export { TransformInterceptor } from './transform.interceptor';
export { LoggingInterceptor } from './logging.interceptor';
export { TimeoutInterceptor } from './timeout.interceptor';
```

**`src/common/index.ts`**

The `@common` barrel. Safe to import bare because `common/` never imports from `modules/`.

```ts
export * from './constants/app.constants';
export * from './decorators';
export * from './dto';
export * from './filters';
export * from './interceptors';
export * from './interfaces/api-response.interface';
export * from './utils/pagination.util';
export { BaseEntity } from './entities/base.entity';
```

---

## 10. Database layer


**`src/database/database.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONFIG_KEY } from '@config';
import type { PostgresDataSourceOptions } from 'typeorm/driver/postgres/PostgresDataSourceOptions';

/**
 * Async TypeORM wiring: connection settings come from validated config, never
 * from raw `process.env` reads scattered across the app.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const options =
          configService.getOrThrow<PostgresDataSourceOptions>(
            DATABASE_CONFIG_KEY,
          );

        return {
          ...options,
          // Entities registered by feature modules via TypeOrmModule.forFeature()
          // are picked up automatically — no central entity array to maintain.
          autoLoadEntities: true,
          retryAttempts: 5,
          retryDelay: 3000,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
```

**`src/database/data-source.ts`**

Used **only** by the TypeORM CLI, which boots outside Nest and therefore loads `.env` itself.

```ts
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from '@config/database.config';

// The TypeORM CLI boots outside Nest, so the .env has to be loaded by hand.
loadEnv({ path: process.env.ENV_FILE ?? '.env' });

/**
 * Used only by the TypeORM CLI (migration:generate / migration:run / revert).
 * Shares buildDatabaseOptions() with the runtime so both point at one database.
 */
export default new DataSource(buildDatabaseOptions());
```

---

## 11. Bootstrap and root module


**`src/main.ts`**

```ts
import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { REQUEST_ID_HEADER } from '@common/constants/app.constants';
import { APP_CONFIG_KEY, type AppConfig } from '@config';
import { setupSwagger } from '@config/swagger.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const config = configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);

  // Security + transport basics.
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    exposedHeaders: [REQUEST_ID_HEADER],
  });

  // /api/v1/... — the version lives in the URL, the prefix is configurable.
  app.setGlobalPrefix(config.apiPrefix, { exclude: ['health'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Flush pending work (DB pool, in-flight requests) on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  setupSwagger(app, config);

  await app.listen(config.port);

  const logger = new Logger('Bootstrap');
  logger.log(`Environment : ${config.env}`);
  logger.log(`API         : ${await app.getUrl()}/${config.apiPrefix}/v1`);
  if (config.swagger.enabled) {
    logger.log(`Swagger     : ${await app.getUrl()}/${config.swagger.path}`);
  }
}

void bootstrap();
```

**`src/app.module.ts`**

Interceptor registration order matters: the first registered sits **outermost**,
so its `map` runs last. `Logging` wraps `Timeout` wraps `ClassSerializer` wraps
`Transform` — meaning serialization strips `@Exclude()`d fields *before* the
envelope is built.

```ts
import {
  ClassSerializerInterceptor,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  APP_FILTER,
  APP_GUARD,
  APP_INTERCEPTOR,
  APP_PIPE,
  HttpAdapterHost,
  Reflector,
} from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  AllExceptionsFilter,
  validationExceptionFactory,
} from '@common/filters';
import {
  LoggingInterceptor,
  TimeoutInterceptor,
  TransformInterceptor,
} from '@common/interceptors';
import {
  APP_CONFIG_KEY,
  appConfig,
  databaseConfig,
  validateEnv,
  type AppConfig,
} from '@config';
import { DatabaseModule } from '@database/database.module';
import { HealthModule } from '@modules/health/health.module';
import { UsersModule } from '@modules/users/users.module';

@Module({
  imports: [
    // Global config: .env is validated once at boot, then injected everywhere.
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}.local`,
        '.env.local',
        '.env',
      ],
      load: [appConfig, databaseConfig],
      validate: validateEnv,
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const { throttle } =
          configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);
        return { throttlers: [{ ttl: throttle.ttl, limit: throttle.limit }] };
      },
    }),

    DatabaseModule,

    // ------------------------------------------------------------ feature modules
    HealthModule,
    UsersModule,
  ],
  providers: [
    // Order matters: interceptors registered first sit outermost in the chain,
    // so Logging wraps Timeout wraps Serializer wraps Transform.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    {
      provide: APP_INTERCEPTOR,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new TimeoutInterceptor(
          configService.getOrThrow<AppConfig>(APP_CONFIG_KEY).requestTimeoutMs,
        ),
    },
    {
      provide: APP_INTERCEPTOR,
      inject: [Reflector],
      useFactory: (reflector: Reflector) => new TransformInterceptor(reflector),
    },
    // Applies @Exclude()/@Expose() so entities never leak secrets over the wire.
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },

    // Global validation: strips unknown keys, rejects extras, coerces types.
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: {
            enableImplicitConversion: false,
            exposeDefaultValues: true,
          },
          stopAtFirstError: false,
          exceptionFactory: validationExceptionFactory,
        }),
    },

    { provide: APP_GUARD, useClass: ThrottlerGuard },

    {
      provide: APP_FILTER,
      inject: [HttpAdapterHost, ConfigService],
      useFactory: (
        httpAdapterHost: HttpAdapterHost,
        configService: ConfigService,
      ) =>
        new AllExceptionsFilter(
          httpAdapterHost,
          configService.getOrThrow<AppConfig>(APP_CONFIG_KEY).isProduction,
        ),
    },
  ],
})
export class AppModule {}
```

---

## 12. Health module

Version-neutral and excluded from the global prefix, so probes always hit a
stable `/health` regardless of API versioning.


**`src/modules/health/health.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

**`src/modules/health/health.controller.ts`**

```ts
import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public, ResponseMessage } from '@common/decorators';

@ApiTags('Health')
// Version-neutral and outside the global prefix so probes hit a stable /health.
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ResponseMessage('Service is healthy')
  @ApiOperation({ summary: 'Liveness/readiness probe (DB + memory)' })
  check() {
    return this.health.check([
      () => this.database.pingCheck('database', { timeout: 3000 }),
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
    ]);
  }
}
```

---

## 13. Environment and Docker


**`.env.example`**

```bash
# ------------------------------------------------------------------ application
NODE_ENV=development
PORT=3000
API_PREFIX=api
# Comma-separated list of allowed origins, or * for any
CORS_ORIGINS=*
REQUEST_TIMEOUT_MS=30000

# --------------------------------------------------------------------- database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=myapp
DB_SCHEMA=public
DB_POOL_SIZE=10
DB_SSL=false
DB_LOGGING=true
# Local development only — use migrations everywhere else
DB_SYNCHRONIZE=false
DB_RUN_MIGRATIONS=false

# ---------------------------------------------------------------------- swagger
SWAGGER_ENABLED=true
SWAGGER_PATH=docs

# --------------------------------------------------------------------- throttle
THROTTLE_TTL=60000
THROTTLE_LIMIT=100
```

```bash
cp .env.example .env
```

Make sure `.env` is gitignored (the Nest scaffold already does this) while
`.env.example` is committed.


**`docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    container_name: myapp-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: myapp
    ports:
      - '5432:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d myapp']
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
```

**`pnpm-workspace.yaml`**

Only needed for pnpm 10+ blocked-build-script handling.

```yaml
allowBuilds:
  unrs-resolver: false
  # Telemetry-only postinstall; no build step is actually needed.
  "@scarf/scarf": false
```

---

## 14. First migration

`synchronize` is off everywhere, so the schema always comes from migrations.

```bash
pnpm db:up                                                    # start postgres
createdb -h localhost -U postgres myapp                       # if not using compose
pnpm migration:generate src/database/migrations/InitialSchema # diff entities -> SQL
pnpm migration:run
```

Day-to-day:

```bash
pnpm migration:generate src/database/migrations/DescriptiveName   # after entity changes
pnpm migration:create   src/database/migrations/DescriptiveName   # empty, hand-written
pnpm migration:run
pnpm migration:revert
pnpm migration:show
```

> `migration:generate` exits with code 1 and "No changes in database schema were
> found" when entities and DB already match. That is success, not an error.

---

## 15. Verification checklist

Run all of these before calling the setup done:

```bash
pnpm typecheck            # tsc --noEmit
pnpm lint
pnpm build                # nest build && tsc-alias
pnpm test                 # includes the path-aliases spec
pnpm test:e2e             # needs a live DB
pnpm migration:show       # proves the TypeORM CLI resolves aliases
pnpm start:prod           # plain node dist/main — no alias resolver
pnpm start:dev            # watch mode via the runtime resolver
```

Alias-specific check — there must be **no** unresolved aliases in the build output:

```bash
grep -rn 'require("@common\|require("@config\|require("@database\|require("@modules' dist/
# expected: no matches (@nestjs/* hits are real packages and fine)
```

Then smoke-test the running app:

```bash
curl -s localhost:3000/health                       # 200, database "up"
curl -s localhost:3000/docs -o /dev/null -w '%{http_code}\n'   # 200

# validation envelope: bad email, short password, unknown property
curl -s -X POST localhost:3000/api/v1/users -H 'content-type: application/json' \
  -d '{"email":"nope","firstName":"","lastName":"X","password":"weak","hacker":1}'
# -> 400 with details keyed by field, and "hacker should not exist"
```

---

## 16. Reference feature module (users)

A complete CRUD module showing the conventions in practice: paginated search +
filter + sort, soft delete/restore, `scrypt` password hashing, and secrets that
never reach the wire. **Copy it as a template, or delete it** — nothing in the
setup depends on it.

If you delete it, also remove its import from `app.module.ts` and drop
`src/modules/users/` plus `test/users.e2e-spec.ts`.

### 16.1 Entity


**`src/modules/users/entities/user.entity.ts`**

`select: false` keeps the hash out of every default query; `@Exclude()` is a second guard for when it is explicitly selected during login.

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';

export enum UserRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

@Entity({ name: 'users' })
export class User extends BaseEntity {
  @ApiProperty({ example: 'ada@example.com' })
  @Index('idx_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @ApiProperty({ example: 'Ada' })
  @Column({ type: 'varchar', length: 100, name: 'first_name' })
  firstName: string;

  @ApiProperty({ example: 'Lovelace' })
  @Column({ type: 'varchar', length: 100, name: 'last_name' })
  lastName: string;

  /**
   * `select: false` keeps the hash out of every default query; `@Exclude()` is a
   * second guard in case it is explicitly selected (e.g. for login).
   */
  @Exclude()
  @Column({
    type: 'varchar',
    length: 255,
    name: 'password_hash',
    select: false,
  })
  passwordHash: string;

  @ApiProperty({ enum: UserRole, example: UserRole.VIEWER })
  @Column({ type: 'enum', enum: UserRole, default: UserRole.VIEWER })
  role: UserRole;

  @ApiProperty({ example: true })
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', name: 'last_login_at', nullable: true })
  lastLoginAt: Date | null;

  @ApiProperty({ example: 'Ada Lovelace' })
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }
}
```

### 16.2 DTOs


**`src/modules/users/dto/create-user.dto.ts`**

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
  @ApiProperty({ example: 'ada@example.com', maxLength: 255 })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @ApiProperty({ example: 'Ada', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  firstName: string;

  @ApiProperty({ example: 'Lovelace', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  lastName: string;

  @ApiProperty({ example: 'Str0ng!Passw0rd', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'password must contain an uppercase letter, a lowercase letter and a digit',
  })
  password: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.VIEWER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole = UserRole.VIEWER;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
```

**`src/modules/users/dto/update-user.dto.ts`**

Derived with `PartialType(OmitType(...))` so validation rules live in exactly one place.

```ts
import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

/**
 * Every CreateUserDto rule stays in force, but each field becomes optional.
 * Password changes go through a dedicated endpoint, so it is omitted here.
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {}
```

**`src/modules/users/dto/query-users.dto.ts`**

Extends `PaginationQueryDto`. Sortable columns are whitelisted with `@IsIn` — never interpolate raw input into `ORDER BY`.

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@common/dto';
import { UserRole } from '../entities/user.entity';

/** Whitelisted sort columns — never interpolate raw user input into ORDER BY. */
export const USER_SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'email',
  'firstName',
] as const;
export type UserSortField = (typeof USER_SORTABLE_FIELDS)[number];

export class QueryUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' : value,
  )
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: USER_SORTABLE_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(USER_SORTABLE_FIELDS)
  sortBy: UserSortField = 'createdAt';
}
```

**`src/modules/users/dto/index.ts`**

```ts
export { CreateUserDto } from './create-user.dto';
export { UpdateUserDto } from './update-user.dto';
export { QueryUsersDto, USER_SORTABLE_FIELDS } from './query-users.dto';
export type { UserSortField } from './query-users.dto';
```

### 16.3 Service


**`src/modules/users/users.service.ts`**

```ts
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { ILike, Repository, type FindOptionsWhere } from 'typeorm';
import { paginate } from '@common/utils/pagination.util';
import type { Paginated } from '@common/interfaces/api-response.interface';
import { CreateUserDto, QueryUsersDto, UpdateUserDto } from './dto';
import { User } from './entities/user.entity';

/** Promise wrapper around scrypt — promisify() loses the types on its overloads. */
const scrypt = (
  password: string,
  salt: Buffer,
  keylen: number,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, (error, derivedKey) =>
      error ? reject(error) : resolve(derivedKey),
    );
  });

/**
 * Reference service: all persistence lives here, controllers stay thin, and
 * every "not found"/"already exists" case is raised as an HttpException that
 * AllExceptionsFilter renders in the standard error envelope.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email },
      withDeleted: true,
    });

    if (existing) {
      throw new ConflictException(
        `A user with email "${dto.email}" already exists`,
      );
    }

    const { password, ...rest } = dto;
    const user = this.usersRepository.create({
      ...rest,
      passwordHash: await this.hashPassword(password),
    });

    const saved = await this.usersRepository.save(user);
    this.logger.log(`Created user ${saved.id}`);

    return saved;
  }

  async findAll(query: QueryUsersDto): Promise<Paginated<User>> {
    const { page, limit, search, role, isActive, sortBy, order } = query;

    const baseWhere: FindOptionsWhere<User> = {
      ...(role ? { role } : {}),
      ...(isActive === undefined ? {} : { isActive }),
    };

    // An array of conditions is OR'ed by TypeORM — one branch per searchable column.
    const where: FindOptionsWhere<User> | FindOptionsWhere<User>[] = search
      ? [
          { ...baseWhere, email: ILike(`%${search}%`) },
          { ...baseWhere, firstName: ILike(`%${search}%`) },
          { ...baseWhere, lastName: ILike(`%${search}%`) },
        ]
      : baseWhere;

    const result = await this.usersRepository.findAndCount({
      where,
      order: { [sortBy]: order },
      skip: query.skip,
      take: limit,
    });

    return paginate(result, page, limit);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id "${id}" was not found`);
    }

    return user;
  }

  /** Includes the password hash — for authentication flows only. */
  async findByEmailWithSecret(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        passwordHash: true,
      },
    });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (dto.email && dto.email !== user.email) {
      const taken = await this.usersRepository.exists({
        where: { email: dto.email },
      });
      if (taken) {
        throw new ConflictException(
          `A user with email "${dto.email}" already exists`,
        );
      }
    }

    Object.assign(user, dto);
    return this.usersRepository.save(user);
  }

  /** Soft delete — the row stays for auditing and can be restored. */
  async remove(id: string): Promise<void> {
    const result = await this.usersRepository.softDelete({ id });

    if (!result.affected) {
      throw new NotFoundException(`User with id "${id}" was not found`);
    }

    this.logger.log(`Soft-deleted user ${id}`);
  }

  async restore(id: string): Promise<User> {
    const result = await this.usersRepository.restore({ id });

    if (!result.affected) {
      throw new NotFoundException(`No deleted user with id "${id}" was found`);
    }

    return this.findOne(id);
  }

  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [saltHex, keyHex] = storedHash.split(':');
    if (!saltHex || !keyHex) return false;

    const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
    const stored = Buffer.from(keyHex, 'hex');

    return derived.length === stored.length && timingSafeEqual(derived, stored);
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64);

    return `${salt.toString('hex')}:${derived.toString('hex')}`;
  }
}
```

### 16.4 Controller and module


**`src/modules/users/users.controller.ts`**

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiPaginatedResponse, ResponseMessage } from '@common/decorators';
import { IdParamDto } from '@common/dto';
import { CreateUserDto, QueryUsersDto, UpdateUserDto } from './dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ResponseMessage('User created successfully')
  @ApiOperation({ summary: 'Create a user' })
  @ApiCreatedResponse({ type: User })
  @ApiConflictResponse({ description: 'Email already in use' })
  create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ResponseMessage('Users fetched successfully')
  @ApiOperation({ summary: 'List users with pagination, search and filters' })
  @ApiPaginatedResponse(User)
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ResponseMessage('User fetched successfully')
  @ApiOperation({ summary: 'Get a single user' })
  @ApiOkResponse({ type: User })
  @ApiNotFoundResponse({ description: 'User does not exist' })
  findOne(@Param() { id }: IdParamDto): Promise<User> {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('User updated successfully')
  @ApiOperation({ summary: 'Update a user' })
  @ApiOkResponse({ type: User })
  update(
    @Param() { id }: IdParamDto,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a user' })
  remove(@Param() { id }: IdParamDto): Promise<void> {
    return this.usersService.remove(id);
  }

  @Patch(':id/restore')
  @ResponseMessage('User restored successfully')
  @ApiOperation({ summary: 'Restore a soft-deleted user' })
  @ApiOkResponse({ type: User })
  restore(@Param() { id }: IdParamDto): Promise<User> {
    return this.usersService.restore(id);
  }
}
```

**`src/modules/users/users.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // forFeature registers the repository AND (with autoLoadEntities) the entity.
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
  // Exported so sibling modules (e.g. auth) can inject UsersService.
  exports: [UsersService],
})
export class UsersModule {}
```

### 16.5 Tests


**`src/modules/users/users.service.spec.ts`**

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Repository } from 'typeorm';
import { SortOrder } from '@common/dto';
import { QueryUsersDto } from './dto';
import { User, UserRole } from './entities/user.entity';
import { UsersService } from './users.service';

type MockRepo = Partial<Record<keyof Repository<User>, jest.Mock>>;

const createMockRepo = (): MockRepo => ({
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  exists: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let repo: MockRepo;

  beforeEach(async () => {
    repo = createMockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('create', () => {
    const dto = {
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      password: 'Str0ng!Pass',
      role: UserRole.VIEWER,
    };

    it('hashes the password instead of storing it in plain text', async () => {
      repo.findOne!.mockResolvedValue(null);
      repo.create!.mockImplementation((v: Partial<User>) => v);
      repo.save!.mockImplementation((v: User) =>
        Promise.resolve({ ...v, id: 'uuid' }),
      );

      await service.create(dto);

      const [[saved]] = repo.create!.mock.calls as [[Partial<User>]];
      expect(saved.passwordHash).toBeDefined();
      expect(saved.passwordHash).not.toContain(dto.password);
      expect(saved).not.toHaveProperty('password');
    });

    it('rejects an email that is already taken', async () => {
      repo.findOne!.mockResolvedValue({ id: 'existing' });

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('translates paging into skip/take and returns pagination meta', async () => {
      repo.findAndCount!.mockResolvedValue([[], 45]);

      const query = Object.assign(new QueryUsersDto(), {
        page: 3,
        limit: 10,
        sortBy: 'createdAt' as const,
        order: SortOrder.DESC,
      });

      const result = await service.findAll(query);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
          order: { createdAt: SortOrder.DESC },
        }),
      );
      expect(result.meta).toEqual({
        total: 45,
        page: 3,
        limit: 10,
        totalPages: 5,
        hasPreviousPage: true,
        hasNextPage: true,
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for an unknown id', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes and throws when nothing matched', async () => {
      repo.softDelete!.mockResolvedValue({ affected: 0 });

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('verifyPassword', () => {
    it('round-trips a hashed password and rejects a wrong one', async () => {
      repo.findOne!.mockResolvedValue(null);
      repo.create!.mockImplementation((v: Partial<User>) => v);
      repo.save!.mockImplementation((v: User) => Promise.resolve(v));

      await service.create({
        email: 'a@b.com',
        firstName: 'A',
        lastName: 'B',
        password: 'Str0ng!Pass',
      });
      const [[{ passwordHash }]] = repo.create!.mock.calls as [[User]];

      await expect(
        service.verifyPassword('Str0ng!Pass', passwordHash),
      ).resolves.toBe(true);
      await expect(service.verifyPassword('wrong', passwordHash)).resolves.toBe(
        false,
      );
    });
  });
});
```

**`test/jest-e2e.json`**

Note the e2e mapper is `../src/`-prefixed because its `rootDir` is the project root, not `src`.

```jsonc
{
  "moduleFileExtensions": [
    "js",
    "json",
    "ts"
  ],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "moduleNameMapper": {
    "^@common$": "<rootDir>/../src/common/index.ts",
    "^@common/(.*)$": "<rootDir>/../src/common/$1",
    "^@config$": "<rootDir>/../src/config/index.ts",
    "^@config/(.*)$": "<rootDir>/../src/config/$1",
    "^@database/(.*)$": "<rootDir>/../src/database/$1",
    "^@modules/(.*)$": "<rootDir>/../src/modules/$1"
  }
}
```

**`test/users.e2e-spec.ts`**

```ts
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { validationExceptionFactory } from '@common/filters';
import type { PaginationMeta } from '@common/interfaces/api-response.interface';

/** Typed view over `response.body`, which supertest exposes as `any`. */
interface Envelope<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta;
  details?: Record<string, string[]>;
}

const body = <T>(res: { body: unknown }): Envelope<T> =>
  res.body as Envelope<T>;

interface UserPayload {
  id: string;
  email: string;
  firstName: string;
}

/**
 * Hits a real database — run `pnpm db:up && pnpm migration:run` first.
 * Mirrors the bootstrap in main.ts so the e2e surface matches production.
 */
describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let createdId: string;
  const email = `e2e-${Date.now()}@example.com`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health reports the database as up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    const payload = body<{ status: string }>(res);

    expect(payload.success).toBe(true);
    expect(payload.data.status).toBe('ok');
  });

  it('POST /api/v1/users creates a user and never returns the password hash', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        email,
        firstName: 'E2E',
        lastName: 'Tester',
        password: 'Str0ng!Pass',
      })
      .expect(201);

    const payload = body<UserPayload>(res);

    expect(payload).toMatchObject({ success: true, statusCode: 201 });
    expect(payload.data.email).toBe(email);
    expect(payload.data).not.toHaveProperty('passwordHash');

    createdId = payload.data.id;
  });

  it('POST /api/v1/users rejects invalid payloads with field-level details', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        email: 'nope',
        firstName: '',
        lastName: 'X',
        password: 'weak',
        extra: true,
      })
      .expect(400);

    const payload = body<null>(res);

    expect(payload.message).toBe('Validation failed');
    expect(payload.details).toHaveProperty('email');
    expect(payload.details).toHaveProperty('extra');
  });

  it('POST /api/v1/users returns 409 on a duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        email,
        firstName: 'Dup',
        lastName: 'Tester',
        password: 'Str0ng!Pass',
      })
      .expect(409);
  });

  it('GET /api/v1/users returns the paginated envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .query({ page: 1, limit: 2 })
      .expect(200);

    const payload = body<UserPayload[]>(res);

    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data.length).toBeLessThanOrEqual(2);
    expect(payload.meta).toMatchObject({ page: 1, limit: 2 });
  });

  it('GET /api/v1/users/:id rejects a malformed uuid', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/not-a-uuid')
      .expect(400);

    expect(body<null>(res).details?.id).toContain('id must be a valid UUID');
  });

  it('DELETE then GET yields 404, and restore brings the user back', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/users/${createdId}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/v1/users/${createdId}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${createdId}/restore`)
      .expect(200);
  });
});
```

---

## 17. Recipes

### Add a feature module

```bash
pnpm nest g module modules/campaigns
pnpm nest g controller modules/campaigns
pnpm nest g service modules/campaigns
```

1. Create `entities/campaign.entity.ts` extending `BaseEntity`
   (`import { BaseEntity } from '@common/entities/base.entity';`).
2. Register it: `imports: [TypeOrmModule.forFeature([Campaign])]` — `autoLoadEntities`
   picks it up, so there is no central entity list to maintain.
3. Write `dto/create-campaign.dto.ts` with `class-validator` rules; derive the
   update DTO with `PartialType(...)`.
4. For list endpoints, extend `PaginationQueryDto` and whitelist sortable columns
   with `@IsIn(...)`; return `paginate(await repo.findAndCount(...), page, limit)`.
5. Import the module in `app.module.ts` under "feature modules"
   (`@modules/campaigns/campaigns.module`).
6. `pnpm migration:generate src/database/migrations/AddCampaigns`.
7. Export the service if other modules need it; never import another module's
   files directly.

### Add a config namespace

1. Declare the variables in `src/config/env.validation.ts`.
2. Create `src/config/<name>.config.ts` with `registerAs('<name>', ...)` and an
   exported interface + `<NAME>_CONFIG_KEY`.
3. Re-export it from `src/config/index.ts`.
4. Add it to `ConfigModule.forRoot({ load: [...] })` in `app.module.ts`.
5. Consume with `configService.getOrThrow<MyConfig>(MY_CONFIG_KEY)`.
6. Document it in `.env.example`.

### Add a path alias

Update **all four** places, then run `pnpm test` — `path-aliases.spec.ts` fails if
they drift:

1. `tsconfig.json` -> `compilerOptions.paths` (map bare aliases to the directory).
2. `package.json` -> `jest.moduleNameMapper`.
3. `test/jest-e2e.json` -> `moduleNameMapper` (with the `../src/` prefix).
4. Nothing else — `tsc-alias` and the dev resolver both read `tsconfig.json`.

### Add authentication

The hooks are already in place:

- `@Public()` — mark a route as unauthenticated; read `IS_PUBLIC_KEY` in your guard.
- `@Roles('admin')` — read `ROLES_KEY` in a `RolesGuard`.
- `@CurrentUser()` / `@CurrentUser('id')` — reads `request.user`.

Register the guard globally with `{ provide: APP_GUARD, useClass: JwtAuthGuard }`
and have it honour `IS_PUBLIC_KEY`. The users module already exposes
`findByEmailWithSecret()` and `verifyPassword()` for a login flow.

---

## 18. Design decisions and gotchas

**Why `registerAs` namespaces instead of raw `ConfigService.get('DB_HOST')`**
Consumers get a typed object and one `getOrThrow` call instead of scattered
string keys with `undefined` handling at every call site.

**Why validate env with `class-validator` rather than Joi**
It is already a dependency for DTOs, so there is one validation mental model
instead of two.

**Why `buildDatabaseOptions()` is exported**
The TypeORM CLI runs outside Nest's DI. Sharing this one function is what keeps
CLI migrations and the running app pointed at the same database.

**Why `APP_PIPE` via `useFactory` in `app.module.ts` rather than `app.useGlobalPipes()`**
Registering through the DI token means the pipe can inject dependencies, and e2e
tests that build a testing module get the same pipe. (The e2e spec re-declares it
because `Test.createTestingModule` does not run `main.ts`.)

**Interceptor order**
First registered = outermost = its `map` runs last. `ClassSerializerInterceptor`
must sit *inside* `TransformInterceptor` so `@Exclude()` is applied to entities
before the envelope is built. Verified: a paginated payload's nested items are
serialized correctly.

**Soft delete**
`BaseEntity.deletedAt` is a `@DeleteDateColumn` with `select: false`, so normal
finds exclude deleted rows automatically. Use `repo.softDelete()` / `repo.restore()`,
and pass `withDeleted: true` when you deliberately need them.

**Unique checks are still racy**
The service checks "does this email exist" before insert, but two concurrent
requests can both pass it. That is exactly why the filter maps Postgres `23505`
to 409 — verified with five concurrent identical creates: one 201, four 409.

**`select: false` plus `@Exclude()`**
Belt and braces. The column is not loaded by default, and if you *do* select it
(login), the serializer still strips it from responses.

**Password hashing without native modules**
`scrypt` from `node:crypto` with a per-user salt and `timingSafeEqual`, so there
is no bcrypt/argon2 native build step. Swap in argon2 if you prefer.

**`@Roles` takes `string[]`, not an enum**
Keeps `common/` free of any dependency on `modules/`. String enums still
type-check at call sites.

**Health route is version-neutral**
`@Controller({ path: 'health', version: VERSION_NEUTRAL })` plus
`setGlobalPrefix(prefix, { exclude: ['health'] })` keeps probes at `/health`
while the API lives at `/api/v1`.

**No `.addServer()` in the Swagger builder**
The global prefix and version are already baked into the generated paths; adding
a server would produce `/api/api/v1/...` in "Try it out".

**`tsc-alias` and bare aliases**
Map `"@common": ["common"]`, not `["common/index.ts"]` — otherwise `dist` gets
`require("./common/index.ts")`.

**`NODE_OPTIONS` for dev**
`nest start` spawns its binary with fixed args, so `--exec` cannot inject `-r`.

**TypeORM CLI loader order**
`node -r ts-node/register -r tsconfig-paths/register ./node_modules/typeorm/cli.js`.
`ts-node` must register the `.ts` extension *before* `tsconfig-paths` tries to
resolve aliases to source files; the bundled `typeorm-ts-node-commonjs` bin does
not guarantee that order.

