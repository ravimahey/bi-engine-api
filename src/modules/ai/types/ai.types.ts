import type { SpendChangeDto } from '@modules/analytics/dto';

export type CostIncreaseSubjectType = 'category' | 'supplier';

/**
 * Everything the model is allowed to see: the already-computed finding, the
 * label of what it's about, and the thresholds that produced its flags.
 * Numbers in the model's answer must trace back to this object.
 */
export interface CostIncreaseFacts {
  subjectType: CostIncreaseSubjectType;
  subjectName: string;
  finding: SpendChangeDto;
  rules: {
    findingThresholdPercent: number;
    qtyStableThresholdPercent: number;
  };
}

/** Result of resolving a spoken name ("packaging") to one canonical row. */
export type NameMatch =
  | { status: 'found'; id: string; name: string }
  | { status: 'not_found' }
  | { status: 'ambiguous'; candidates: string[] };

export interface TopSupplierIncreaseParams {
  organizationId: string;
  currentFrom: string;
  currentTo: string;
  priorFrom: string;
  priorTo: string;
  limit: number;
}

/** Raw shape of the ranking aggregate - Postgres `numeric` comes back as strings. */
export interface SupplierIncreaseRaw {
  vendorName: string;
  currentSpend: string;
  priorSpend: string;
}

export interface SupplierIncreaseRow {
  supplierName: string;
  currentSpend: number;
  priorSpend: number;
  change: number;
  changePercent: number | null;
}
