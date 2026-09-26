import { registerAs } from '@nestjs/config';
import { join } from 'node:path';
import pg from 'pg';
import type { PostgresDataSourceOptions } from 'typeorm/driver/postgres/PostgresDataSourceOptions.js';

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
  // Pass the driver explicitly: TypeORM otherwise loads `pg` via a dynamic
  // require that serverless bundlers (Vercel) can't trace, so it gets dropped.
  driver: pg,
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'ordara_analytics',
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
