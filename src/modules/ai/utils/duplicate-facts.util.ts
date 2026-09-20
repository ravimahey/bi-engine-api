import type { DuplicateTransactionGroupDto } from '@modules/analytics/dto';
import type { DuplicateTotalsDto } from '../dto';
import { round2 } from './number-format.util';

/** What the model sees per group - no ids, so nothing but real figures can be quoted. */
export interface DuplicatePromptGroup {
  supplierName: string | null;
  transactionDate: string;
  totalAmount: number;
  occurrences: number;
}

export interface DuplicatePromptFacts {
  totals: DuplicateTotalsDto;
  groups: DuplicatePromptGroup[];
}

/**
 * Totals over every group (not just the ones sent to the model).
 * `possiblyDoubleCounted` = amount x (occurrences - 1): the first record is
 * legitimate spend, only the repeats could be double-counted.
 */
export function computeDuplicateTotals(
  groups: DuplicateTransactionGroupDto[],
): DuplicateTotalsDto {
  return {
    groupCount: groups.length,
    possibleDuplicateRecords: groups.reduce((sum, g) => sum + g.occurrences, 0),
    possiblyDoubleCounted: round2(
      groups.reduce((sum, g) => sum + g.totalAmount * (g.occurrences - 1), 0),
    ),
  };
}

/** The first `maxGroups` groups (already sorted most-repeated first) plus all-group totals. */
export function buildDuplicatePromptFacts(
  groups: DuplicateTransactionGroupDto[],
  maxGroups: number,
): DuplicatePromptFacts {
  return {
    totals: computeDuplicateTotals(groups),
    groups: groups.slice(0, maxGroups).map((g) => ({
      supplierName: g.vendorName,
      transactionDate: g.transactionDate,
      totalAmount: g.totalAmount,
      occurrences: g.occurrences,
    })),
  };
}
