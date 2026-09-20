import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@common/decorators';
import { ExpenseSummaryService } from '@modules/analytics/services';
import {
  EXPENSE_SUMMARY_SYSTEM_PROMPT,
  EXPLANATION_DISCLAIMER,
} from '../constants';
import type {
  ExpenseSummaryExplainQueryDto,
  ExplainedExpenseSummaryDto,
} from '../dto';
import { expenseSummaryExplanationSchema } from '../schemas';
import {
  buildExpenseSummaryFacts,
  containsUnsupportedClaim,
  containsUnsupportedSavingClaim,
  toExpenseSummaryPromptFacts,
} from '../utils';
import { ExplanationRunnerService } from './explanation-runner.service';

/**
 * Dashboard blurb over `ExpenseSummaryService` (LANGCHAIN_INTEGRATION_GUIDE.md
 * §3.4): "BI calculates Spend +12%; AI says which category drove it". Totals,
 * category shares and per-category changes are all computed in code before
 * the model sees anything.
 */
@Injectable()
export class ExpenseSummaryExplainerService {
  constructor(
    private readonly expenseSummary: ExpenseSummaryService,
    private readonly runner: ExplanationRunnerService,
  ) {}

  async explain(
    query: ExpenseSummaryExplainQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<ExplainedExpenseSummaryDto> {
    const window = {
      organizationId: query.organizationId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    };
    // The first analytics call runs the organization access check.
    const [current, categories] = await Promise.all([
      this.expenseSummary.getTotalSpend(window, currentUser),
      this.expenseSummary.getCategorySpend(window, currentUser),
    ]);

    let prior;
    if (query.priorFrom && query.priorTo) {
      const priorWindow = {
        organizationId: query.organizationId,
        dateFrom: query.priorFrom,
        dateTo: query.priorTo,
      };
      const [total, priorCategories] = await Promise.all([
        this.expenseSummary.getTotalSpend(priorWindow, currentUser),
        this.expenseSummary.getCategorySpend(priorWindow, currentUser),
      ]);
      prior = { total, categories: priorCategories };
    }

    const facts = buildExpenseSummaryFacts({ current, categories, prior });

    // No spend in the window: nothing for the model to say.
    const output =
      current.lineCount === 0
        ? null
        : await this.runner.run({
            label: 'expense-summary',
            schema: expenseSummaryExplanationSchema,
            systemPrompt: EXPENSE_SUMMARY_SYSTEM_PROMPT,
            facts: toExpenseSummaryPromptFacts(facts),
            collectTexts: (o) => [
              o.headline,
              o.summary,
              ...o.drivers,
              ...o.limitations,
            ],
            hasUnsupportedClaim: (texts) =>
              containsUnsupportedSavingClaim(texts) ||
              containsUnsupportedClaim(texts, 'volume'),
          });

    return {
      ...facts,
      explanation: output && { ...output, disclaimer: EXPLANATION_DISCLAIMER },
      model: output ? this.runner.modelName : null,
      generatedAt: new Date().toISOString(),
    };
  }
}
