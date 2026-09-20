import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '@common/decorators';
import {
  QTY_STABLE_THRESHOLD_PERCENT,
  SPEND_CHANGE_FINDING_THRESHOLD_PERCENT,
} from '@modules/analytics/constants';
import type {
  CategorySpendChangeQueryDto,
  SpendChangeDto,
  SupplierSpendChangeQueryDto,
} from '@modules/analytics/dto';
import { CostIncreaseFindingService } from '@modules/analytics/services';
import {
  COST_INCREASE_SYSTEM_PROMPT,
  EXPLANATION_DISCLAIMER,
  SUGGESTED_OPTIONS,
} from '../constants';
import type {
  CostIncreaseExplanationDto,
  ExplainedCostIncreaseDto,
} from '../dto';
import {
  costIncreaseExplanationSchema,
  type CostIncreaseExplanationOutput,
} from '../schemas';
import type { CostIncreaseFacts, CostIncreaseSubjectType } from '../types';
import { containsUnsupportedClaim, findUngroundedNumbers } from '../utils';
import { LlmService } from './llm.service';
import { SubjectNameService } from './subject-name.service';

/**
 * Pattern A from LANGCHAIN_INTEGRATION_GUIDE.md: BI first, AI second.
 * `CostIncreaseFindingService` computes and access-checks the finding
 * (SQL, tenant scoping); Gemini only words it. AI is an enhancement, never
 * a dependency — if it's off, fails, times out, or cites a number/cause the
 * finding doesn't support, the caller still gets the finding with
 * `explanation: null`.
 */
@Injectable()
export class CostIncreaseExplainerService {
  private readonly logger = new Logger(CostIncreaseExplainerService.name);

  constructor(
    private readonly costIncreaseFinding: CostIncreaseFindingService,
    private readonly subjectNames: SubjectNameService,
    private readonly llm: LlmService,
  ) {}

  async explainCategory(
    query: CategorySpendChangeQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<ExplainedCostIncreaseDto> {
    // Finding first: it runs the organization access check before any
    // lookup or model call can touch the requested tenant.
    const finding = await this.costIncreaseFinding.getCategorySpendChange(
      query,
      currentUser,
    );
    const subjectName = await this.subjectNames.getCategoryName(
      query.organizationId,
      query.categoryId,
    );

    return this.explain('category', subjectName, finding);
  }

  async explainSupplier(
    query: SupplierSpendChangeQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<ExplainedCostIncreaseDto> {
    const finding = await this.costIncreaseFinding.getSupplierSpendChange(
      query,
      currentUser,
    );
    const subjectName = await this.subjectNames.getVendorName(
      query.organizationId,
      query.vendorId,
    );

    return this.explain('supplier', subjectName, finding);
  }

  private async explain(
    subjectType: CostIncreaseSubjectType,
    subjectName: string,
    finding: SpendChangeDto,
  ): Promise<ExplainedCostIncreaseDto> {
    const facts: CostIncreaseFacts = {
      subjectType,
      subjectName,
      finding,
      rules: {
        findingThresholdPercent: SPEND_CHANGE_FINDING_THRESHOLD_PERCENT,
        qtyStableThresholdPercent: QTY_STABLE_THRESHOLD_PERCENT,
      },
    };
    const explanation = await this.generateExplanation(facts);

    return {
      subjectName,
      finding,
      explanation,
      model: explanation ? this.llm.modelName : null,
      generatedAt: new Date().toISOString(),
    };
  }

  private async generateExplanation(
    facts: CostIncreaseFacts,
  ): Promise<CostIncreaseExplanationDto | null> {
    if (!this.llm.isAvailable) return null;

    let output: CostIncreaseExplanationOutput;
    try {
      output = await this.llm.generateStructured(
        costIncreaseExplanationSchema,
        COST_INCREASE_SYSTEM_PROMPT,
        this.buildUserPrompt(facts),
      );
    } catch (error) {
      this.logger.warn(
        `Gemini explanation failed, returning finding only: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }

    return this.verify(output, facts);
  }

  /** Drops the whole explanation if any figure or claim isn't backed by the finding. */
  private verify(
    output: CostIncreaseExplanationOutput,
    facts: CostIncreaseFacts,
  ): CostIncreaseExplanationDto | null {
    const texts = [
      output.headline,
      output.whatHappened,
      output.whyItMatters,
      ...output.limitations,
      ...output.suggestedOptions.flatMap((o) => [...o.pros, ...o.cons]),
    ];

    const ungrounded = findUngroundedNumbers(texts, facts);
    if (ungrounded.length > 0) {
      this.logger.warn(
        `Explanation rejected: figures not in the finding (${ungrounded.join(', ')})`,
      );
      return null;
    }

    if (containsUnsupportedClaim(texts, facts.finding.driver)) {
      this.logger.warn('Explanation rejected: unsupported cause/saving claim');
      return null;
    }

    return { ...output, disclaimer: EXPLANATION_DISCLAIMER };
  }

  private buildUserPrompt(facts: CostIncreaseFacts): string {
    return [
      `Allowed option names: ${SUGGESTED_OPTIONS.join(', ')}`,
      `FACTS:`,
      JSON.stringify(facts),
    ].join('\n');
  }
}
