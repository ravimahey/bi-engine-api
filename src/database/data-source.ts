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
