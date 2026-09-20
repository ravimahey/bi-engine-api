import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import type { AuthenticatedUser } from '@common/decorators';
import {
  CostIncreaseFindingService,
  DataQualityService,
  DuplicateDetectionService,
  ExpenseSummaryService,
} from '@modules/analytics/services';
import {
  MAX_TOOL_RESULT_ROWS,
  SUBMIT_ANSWER_TOOL,
  TOP_CATEGORIES_LIMIT,
} from '../constants';
import type { AskFactDto } from '../dto';
import { askAnswerSchema } from '../schemas';
import type { NameMatch } from '../types';
import { buildDuplicatePromptFacts, buildTopCategories } from '../utils';
import { NameResolverService } from './name-resolver.service';
import { TopSupplierIncreasesService } from './top-supplier-increases.service';

export interface AskToolkit {
  /** Data tools plus the `submit_answer` tool the model finishes with. */
  tools: StructuredToolInterface[];
  /** Filled as tools run: the raw outputs the final answer is grounded in. */
  facts: AskFactDto[];
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe('Date as YYYY-MM-DD');

const dateRange = { dateFrom: isoDate, dateTo: isoDate };
const comparePeriods = {
  currentFrom: isoDate.describe('Start of the current period'),
  currentTo: isoDate.describe('End of the current period'),
  priorFrom: isoDate.describe('Start of the prior period to compare against'),
  priorTo: isoDate.describe('End of the prior period to compare against'),
};
const rowLimit = z
  .number()
  .int()
  .min(1)
  .max(MAX_TOOL_RESULT_ROWS)
  .optional()
  .describe(`How many rows to return (max ${MAX_TOOL_RESULT_ROWS})`);

/**
 * Builds the approved Ask Ordaraa tools for ONE request (LANGCHAIN_INTEGRATION_GUIDE.md
 * §3.6). Each tool is a thin wrapper over an existing analytics service and
 * closes over the caller's validated `organizationId` and `AuthenticatedUser`,
 * so the model can never pick another tenant: it only supplies dates and
 * names. The services run their own access check on every call as well.
 * A tool failure is returned to the model as `{ error }` (not thrown, not
 * recorded as a fact), so it can say what it couldn't find.
 */
@Injectable()
export class AskToolsFactory {
  constructor(
    private readonly expenseSummary: ExpenseSummaryService,
    private readonly costIncrease: CostIncreaseFindingService,
    private readonly duplicates: DuplicateDetectionService,
    private readonly dataQuality: DataQualityService,
    private readonly topSuppliers: TopSupplierIncreasesService,
    private readonly names: NameResolverService,
  ) {}

  create(organizationId: string, user: AuthenticatedUser): AskToolkit {
    const facts: AskFactDto[] = [];

    const run = async (
      name: string,
      input: Record<string, unknown>,
      fn: () => Promise<unknown>,
    ): Promise<string> => {
      try {
        const result = await fn();
        facts.push({ tool: name, input, result });
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({
          error: error instanceof HttpException ? error.message : 'Tool failed',
        });
      }
    };

    const tools = [
      tool(
        (input) =>
          run('get_total_spend', input, () =>
            this.expenseSummary.getTotalSpend(
              { organizationId, ...input },
              user,
            ),
          ),
        {
          name: 'get_total_spend',
          description:
            'Total spend and number of expense lines for a date range.',
          schema: z.object(dateRange),
        },
      ),
      tool(
        (input) =>
          run('get_top_categories', input, async () => {
            const window = {
              organizationId,
              dateFrom: input.dateFrom,
              dateTo: input.dateTo,
            };
            const [total, categories] = await Promise.all([
              this.expenseSummary.getTotalSpend(window, user),
              this.expenseSummary.getCategorySpend(window, user),
            ]);
            const { topCategories, otherCategories } = buildTopCategories(
              categories,
              total.totalSpend,
              input.limit ?? TOP_CATEGORIES_LIMIT,
            );
            return {
              totalSpend: total.totalSpend,
              topCategories: topCategories.map((c) => ({
                categoryName: c.categoryName,
                totalSpend: c.totalSpend,
                sharePercent: c.sharePercent,
              })),
              otherCategories,
            };
          }),
        {
          name: 'get_top_categories',
          description:
            'Top expense categories by spend for a date range, with each one’s share of total spend.',
          schema: z.object({ ...dateRange, limit: rowLimit }),
        },
      ),
      tool(
        ({ categoryName, ...periods }) =>
          run(
            'get_category_cost_change',
            { categoryName, ...periods },
            async () => {
              const match = await this.names.resolveCategory(
                organizationId,
                categoryName,
              );
              const found = this.requireMatch(match, 'category', categoryName);
              const finding = await this.costIncrease.getCategorySpendChange(
                { organizationId, categoryId: found.id, ...periods },
                user,
              );
              return { categoryName: found.name, ...finding };
            },
          ),
        {
          name: 'get_category_cost_change',
          description:
            'Spend change for ONE category between a current and a prior period, with the price/volume driver and whether it counts as a finding.',
          schema: z.object({
            categoryName: z.string().min(1).max(100),
            ...comparePeriods,
          }),
        },
      ),
      tool(
        ({ supplierName, ...periods }) =>
          run(
            'get_supplier_cost_change',
            { supplierName, ...periods },
            async () => {
              const match = await this.names.resolveVendor(
                organizationId,
                supplierName,
              );
              const found = this.requireMatch(match, 'supplier', supplierName);
              const finding = await this.costIncrease.getSupplierSpendChange(
                { organizationId, vendorId: found.id, ...periods },
                user,
              );
              return { supplierName: found.name, ...finding };
            },
          ),
        {
          name: 'get_supplier_cost_change',
          description:
            'Spend change for ONE supplier between a current and a prior period, with the price/volume driver and whether it counts as a finding.',
          schema: z.object({
            supplierName: z.string().min(1).max(100),
            ...comparePeriods,
          }),
        },
      ),
      tool(
        ({ limit, ...periods }) =>
          run(
            'get_top_supplier_increases',
            { limit, ...periods },
            async () => ({
              suppliers: await this.topSuppliers.findTop(
                {
                  organizationId,
                  limit: limit ?? MAX_TOOL_RESULT_ROWS,
                  ...periods,
                },
                user,
              ),
            }),
          ),
        {
          name: 'get_top_supplier_increases',
          description:
            'Ranking of suppliers whose spend rose the most between a prior and a current period (biggest increase first). Shows spend movement only, not whether price or volume drove it - use get_supplier_cost_change for that.',
          schema: z.object({ ...comparePeriods, limit: rowLimit }),
        },
      ),
      tool(
        () =>
          run('get_possible_duplicates', {}, async () =>
            buildDuplicatePromptFacts(
              await this.duplicates.findPossibleDuplicates(
                { organizationId },
                user,
              ),
              MAX_TOOL_RESULT_ROWS,
            ),
          ),
        {
          name: 'get_possible_duplicates',
          description:
            'Groups of POSSIBLE duplicate expense transactions (same supplier, date and amount) with totals.',
          schema: z.object({}),
        },
      ),
      tool(
        () =>
          run('get_data_quality_summary', {}, async () => {
            const { count } = await this.dataQuality.countIssues(
              { organizationId },
              user,
            );
            return {
              issueCount: count,
              status: count > 0 ? 'needs_review' : 'good',
            };
          }),
        {
          name: 'get_data_quality_summary',
          description:
            'Number of expense transactions needing review (no supplier, or a zero/negative amount).',
          schema: z.object({}),
        },
      ),
      tool(() => 'received', {
        name: SUBMIT_ANSWER_TOOL,
        description:
          'Deliver the final answer to the owner. Call exactly once, when finished.',
        schema: askAnswerSchema,
      }),
    ] as StructuredToolInterface[];

    return { tools, facts };
  }

  private requireMatch(
    match: NameMatch,
    kind: string,
    spoken: string,
  ): { id: string; name: string } {
    if (match.status === 'found') return { id: match.id, name: match.name };
    if (match.status === 'not_found') {
      throw new NotFoundException(`No ${kind} matches "${spoken}"`);
    }
    throw new BadRequestException(
      `"${spoken}" matches several ${kind}s (${match.candidates.join(', ')}); ask the owner which one`,
    );
  }
}
