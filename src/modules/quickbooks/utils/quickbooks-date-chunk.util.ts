import type { QuickbooksDateChunkUnit } from '../constants';
import { QUICKBOOKS_POLL_CHUNK_UNIT } from '../constants';

/** One in-memory, half-open date window: `[startDate, endDate)`. Never persisted. */
export interface QuickbooksDateChunk {
  /** Inclusive, YYYY-MM-DD. */
  startDate: string;
  /** Exclusive, YYYY-MM-DD — shared with the next chunk's `startDate`, so chunks never gap or overlap. */
  endDate: string;
}

/** The public poll API's `toDate` is inclusive; internally every boundary is the exclusive `toDate + 1 day`. */
export function toExclusiveEndDate(toDate: string): string {
  return addDays(toDate, 1);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/**
 * Splits `[startDate, exclusiveEndDate)` into contiguous, non-overlapping
 * `unit`-wide chunks, clipping the final one to `exclusiveEndDate` instead of
 * overshooting it. Returns `[]` when `startDate >= exclusiveEndDate` — the
 * whole requested range is already covered by a prior run's `SyncCursor`.
 */
export function buildDateChunks(
  startDate: string,
  exclusiveEndDate: string,
  unit: QuickbooksDateChunkUnit = QUICKBOOKS_POLL_CHUNK_UNIT,
): QuickbooksDateChunk[] {
  const chunks: QuickbooksDateChunk[] = [];
  let cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${exclusiveEndDate}T00:00:00.000Z`);

  while (cursor < end) {
    const next = addUnit(cursor, unit);
    const chunkEnd = next < end ? next : end;
    chunks.push({ startDate: toIsoDate(cursor), endDate: toIsoDate(chunkEnd) });
    cursor = chunkEnd;
  }

  return chunks;
}

function addUnit(date: Date, unit: QuickbooksDateChunkUnit): Date {
  const next = new Date(date);
  switch (unit) {
    case 'day':
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    case 'week':
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    case 'month':
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
  }
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
