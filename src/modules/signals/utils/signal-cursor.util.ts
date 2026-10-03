import { BadRequestException } from '@nestjs/common';
import type { SignalCursor } from '../types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `2026-09-30T10:15:30.123456Z` — what `SIGNAL_CURSOR_TIMESTAMP_SQL` produces. */
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/**
 * Renders `created_at` in UTC at full microsecond precision. A JS `Date`
 * only keeps milliseconds, so a cursor built from one would land *before*
 * rows inserted in the same statement (they share one timestamp) and skip
 * them — the cursor has to carry the exact value Postgres stored.
 */
export const signalCursorTimestampSql = (alias: string): string =>
  `to_char(${alias}.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** Opaque to clients: base64url of `createdAt|id`. */
export const encodeSignalCursor = (cursor: SignalCursor): string =>
  Buffer.from(`${cursor.createdAt}|${cursor.id}`, 'utf8').toString('base64url');

export const decodeSignalCursor = (value: string): SignalCursor => {
  const [createdAt, id, ...rest] = Buffer.from(value, 'base64url')
    .toString('utf8')
    .split('|');

  if (
    rest.length > 0 ||
    !TIMESTAMP_PATTERN.test(createdAt ?? '') ||
    !UUID_PATTERN.test(id ?? '')
  ) {
    throw new BadRequestException('cursor is not a valid signals cursor');
  }

  return { createdAt, id };
};
