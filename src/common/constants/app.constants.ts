/** Metadata keys used by custom decorators + the guards/interceptors reading them. */
export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const RESPONSE_MESSAGE_KEY = 'responseMessage';
export const REQUEST_TIMEOUT_KEY = 'requestTimeout';

/** Header carrying a per-request correlation id through logs and responses. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** URI versioning segment (`/v{API_VERSION}/...`) — one source of truth for main.ts and cookie.util. */
export const API_VERSION = '1';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** httpOnly cookie names carrying the JWT access/refresh tokens. */
export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** Postgres error codes worth mapping to meaningful HTTP statuses. */
export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  INVALID_TEXT_REPRESENTATION: '22P02',
} as const;
