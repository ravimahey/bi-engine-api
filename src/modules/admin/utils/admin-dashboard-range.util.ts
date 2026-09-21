import type { AdminDashboardQueryDto } from '../dto';

export interface ResolvedDashboardRange {
  dateFrom: string;
  dateTo: string;
  /** Exclusive upper bound (`dateTo` + 1 day) — `createdAt` is a timestamp, so an inclusive same-day filter needs this rather than a plain `BETWEEN`. */
  dateToExclusive: string;
}

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Growth trends default to the trailing 12 months ending today when the
 * caller omits either date — the platform-wide snapshot totals need no
 * range at all, so nothing else in `AdminDashboardService` depends on this.
 */
export function resolveDashboardRange(
  query: AdminDashboardQueryDto,
): ResolvedDashboardRange {
  let dateFrom = query.dateFrom;
  let dateTo = query.dateTo;

  if (!dateFrom || !dateTo) {
    const today = new Date();
    const from = new Date(today);
    from.setUTCFullYear(from.getUTCFullYear() - 1);
    from.setUTCDate(from.getUTCDate() + 1);
    dateFrom = toIsoDate(from);
    dateTo = toIsoDate(today);
  }

  const exclusive = new Date(`${dateTo}T00:00:00.000Z`);
  exclusive.setUTCDate(exclusive.getUTCDate() + 1);

  return { dateFrom, dateTo, dateToExclusive: exclusive.toISOString() };
}
