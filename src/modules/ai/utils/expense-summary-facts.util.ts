import type { CategorySpendDto, TotalSpendDto } from '@modules/analytics/dto';
import {
  TOP_CATEGORIES_LIMIT,
  TOP_CATEGORY_INCREASES_LIMIT,
  UNCATEGORIZED_LABEL,
} from '../constants';
import type {
  CategoryIncreaseDto,
  CategoryShareDto,
  OtherCategoriesDto,
  SpendComparisonDto,
} from '../dto';
import { round1, round2 } from './number-format.util';

export interface ExpenseSummaryInput {
  current: TotalSpendDto;
  categories: CategorySpendDto[];
  prior?: { total: TotalSpendDto; categories: CategorySpendDto[] };
}

/** The deterministic part of the summary response - everything but the AI text. */
export interface ExpenseSummaryFacts {
  period: TotalSpendDto;
  topCategories: CategoryShareDto[];
  otherCategories: OtherCategoriesDto | null;
  comparison: SpendComparisonDto | null;
}

const percentOf = (part: number, whole: number): number =>
  whole > 0 ? round1((part / whole) * 100) : 0;

/**
 * Top-N categories with their share of `totalSpend`, plus the remainder as
 * "other". Shares are computed here so the model only ever quotes them.
 * Input is expected sorted by spend descending (as the analytics query does).
 */
export function buildTopCategories(
  categories: CategorySpendDto[],
  totalSpend: number,
  limit: number = TOP_CATEGORIES_LIMIT,
): {
  topCategories: CategoryShareDto[];
  otherCategories: OtherCategoriesDto | null;
} {
  const topCategories = categories.slice(0, limit).map((c) => ({
    ...c,
    categoryName: c.categoryName ?? UNCATEGORIZED_LABEL,
    totalSpend: round2(c.totalSpend),
    sharePercent: percentOf(c.totalSpend, totalSpend),
  }));

  const rest = categories.slice(limit);
  const otherSpend = round2(rest.reduce((sum, c) => sum + c.totalSpend, 0));

  return {
    topCategories,
    otherCategories:
      rest.length > 0
        ? {
            totalSpend: otherSpend,
            sharePercent: percentOf(otherSpend, totalSpend),
          }
        : null,
  };
}

/** Category-by-category increase between two periods, biggest first; decreases are ignored. */
function buildCategoryIncreases(
  current: CategorySpendDto[],
  prior: CategorySpendDto[],
): CategoryIncreaseDto[] {
  const priorSpend = new Map(prior.map((c) => [c.categoryId, c.totalSpend]));

  return current
    .map((c) => {
      const before = priorSpend.get(c.categoryId) ?? 0;
      return {
        categoryId: c.categoryId,
        categoryName: c.categoryName ?? UNCATEGORIZED_LABEL,
        currentSpend: round2(c.totalSpend),
        priorSpend: round2(before),
        change: round2(c.totalSpend - before),
      };
    })
    .filter((c) => c.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, TOP_CATEGORY_INCREASES_LIMIT);
}

export function buildExpenseSummaryFacts(
  input: ExpenseSummaryInput,
): ExpenseSummaryFacts {
  const { topCategories, otherCategories } = buildTopCategories(
    input.categories,
    input.current.totalSpend,
  );

  let comparison: SpendComparisonDto | null = null;
  if (input.prior) {
    const spendChange = round2(
      input.current.totalSpend - input.prior.total.totalSpend,
    );
    comparison = {
      prior: input.prior.total,
      spendChange,
      spendChangePercent:
        input.prior.total.totalSpend > 0
          ? round1((spendChange / input.prior.total.totalSpend) * 100)
          : null,
      categoryIncreases: buildCategoryIncreases(
        input.categories,
        input.prior.categories,
      ),
    };
  }

  return {
    period: input.current,
    topCategories,
    otherCategories,
    comparison,
  };
}

/** The same facts minus internal ids, so a UUID's digits can't pass the number check. */
export function toExpenseSummaryPromptFacts(facts: ExpenseSummaryFacts) {
  return {
    period: facts.period,
    topCategories: facts.topCategories.map(
      ({ categoryName, totalSpend, lineCount, sharePercent }) => ({
        categoryName,
        totalSpend,
        lineCount,
        sharePercent,
      }),
    ),
    otherCategories: facts.otherCategories,
    comparison: facts.comparison && {
      prior: facts.comparison.prior,
      spendChange: facts.comparison.spendChange,
      spendChangePercent: facts.comparison.spendChangePercent,
      categoryIncreases: facts.comparison.categoryIncreases.map(
        ({ categoryName, currentSpend, priorSpend, change }) => ({
          categoryName,
          currentSpend,
          priorSpend,
          change,
        }),
      ),
    },
  };
}
