import { QueryFailedError } from 'typeorm';
import { PG_ERROR_CODES } from '@common/constants';

/** True when a TypeORM write failed on a Postgres unique constraint/index. */
export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string } | undefined)?.code ===
    PG_ERROR_CODES.UNIQUE_VIOLATION;
