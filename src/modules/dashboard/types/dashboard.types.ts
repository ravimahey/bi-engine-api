/** Raw aggregate rows — Postgres `numeric`/`bigint` come back as strings, cast once at the service boundary. */
export interface PeriodTotalRaw {
  period: string;
  totalAmount: string;
  lineCount: string;
}

export interface BreakdownRaw {
  id: string | null;
  name: string | null;
  totalSpend: string;
  lineCount: string;
}

export interface BreakdownTotalRaw {
  total: string | null;
  lineCount: string;
}
