/**
 * A period-over-period spend increase must clear this percentage to count
 * as a money-leak finding — ordinary price drift shouldn't light up the
 * dashboard. FINDINGS_AND_AI_CALCULATION_GUIDE.md §4.3.
 */
export const SPEND_CHANGE_FINDING_THRESHOLD_PERCENT = 15;

/**
 * Below this relative quantity movement, treat volume as flat when
 * classifying a spend increase as price- vs volume-driven — the
 * "don't call volume growth a savings opportunity" rule (E2E-02): if
 * quantity tracks spend, the increase is volume-driven, not a supplier
 * overcharging you.
 */
export const QTY_STABLE_THRESHOLD_PERCENT = 5;

/**
 * At most this many `possible_duplicate` signals are raised per
 * organization — the biggest groups first. An import with hundreds of
 * repeated rows should not bury the inbox; the Duplicates page still lists
 * every group.
 */
export const MAX_DUPLICATE_SIGNALS = 20;
