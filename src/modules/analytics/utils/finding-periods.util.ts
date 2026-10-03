import type { SpendChangeWindows } from '../types';

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

const monthStart = (year: number, month: number): Date =>
  new Date(Date.UTC(year, month, 1));

/** Day 0 of the next month is the last day of this one. */
const monthEnd = (year: number, month: number): Date =>
  new Date(Date.UTC(year, month + 1, 0));

/**
 * The last complete calendar month against the one before it — the same
 * "Last month" default the Cost Increases page opens on. Complete months
 * only, so a half-finished month is never measured against a full one.
 */
export function lastFullMonthWindows(today: Date): SpendChangeWindows {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();

  return {
    currentFrom: isoDate(monthStart(year, month - 1)),
    currentTo: isoDate(monthEnd(year, month - 1)),
    priorFrom: isoDate(monthStart(year, month - 2)),
    priorTo: isoDate(monthEnd(year, month - 2)),
  };
}

/** The calendar month `today` falls in, first day to last. */
export function currentMonthWindow(today: Date): { from: string; to: string } {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();

  return {
    from: isoDate(monthStart(year, month)),
    to: isoDate(monthEnd(year, month)),
  };
}
