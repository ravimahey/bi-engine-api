import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@common/decorators';
import {
  DataQualityIssuesQueryDto,
  type OrganizationIdQueryDto,
} from '@modules/analytics/dto';
import { DataQualityService } from '@modules/analytics/services';
import {
  DATA_QUALITY_SAMPLE_SIZE,
  DATA_QUALITY_SYSTEM_PROMPT,
  EXPLANATION_DISCLAIMER,
} from '../constants';
import type { DataQualitySampleDto, ExplainedDataQualityDto } from '../dto';
import { dataQualityExplanationSchema } from '../schemas';
import { containsUnsupportedSavingClaim } from '../utils';
import { ExplanationRunnerService } from './explanation-runner.service';

const EMPTY_SAMPLE: DataQualitySampleDto = {
  sampleSize: 0,
  missingSupplier: 0,
  nonPositiveAmount: 0,
};

/**
 * Explains `DataQualityService`'s issues (LANGCHAIN_INTEGRATION_GUIDE.md
 * §3.3). Pass/fail stays rule-based: `status` and `issueCount` come from BI,
 * and the model only explains why it matters and how to fix it - from the
 * count plus a small, id-free sample, never the full table.
 */
@Injectable()
export class DataQualityExplainerService {
  constructor(
    private readonly dataQuality: DataQualityService,
    private readonly runner: ExplanationRunnerService,
  ) {}

  async explain(
    query: OrganizationIdQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<ExplainedDataQualityDto> {
    // Runs the organization access check before any model call.
    const { count } = await this.dataQuality.countIssues(query, currentUser);

    if (count === 0) {
      return this.build(0, EMPTY_SAMPLE, null);
    }

    const page = await this.dataQuality.listIssues(
      Object.assign(new DataQualityIssuesQueryDto(), {
        organizationId: query.organizationId,
        limit: DATA_QUALITY_SAMPLE_SIZE,
      }),
      currentUser,
    );
    const sample: DataQualitySampleDto = {
      sampleSize: page.items.length,
      missingSupplier: page.items.filter((t) => !t.vendorId).length,
      nonPositiveAmount: page.items.filter((t) => Number(t.totalAmount) <= 0)
        .length,
    };

    const facts = { issueCount: count, sample };
    const output = await this.runner.run({
      label: 'data-quality',
      schema: dataQualityExplanationSchema,
      systemPrompt: DATA_QUALITY_SYSTEM_PROMPT,
      facts,
      collectTexts: (o) => [
        o.headline,
        o.whyItMatters,
        ...o.howToFix,
        ...o.limitations,
      ],
      hasUnsupportedClaim: containsUnsupportedSavingClaim,
    });

    return this.build(
      count,
      sample,
      output && { ...output, disclaimer: EXPLANATION_DISCLAIMER },
    );
  }

  private build(
    issueCount: number,
    sample: DataQualitySampleDto,
    explanation: ExplainedDataQualityDto['explanation'],
  ): ExplainedDataQualityDto {
    return {
      status: issueCount > 0 ? 'needs_review' : 'good',
      issueCount,
      sample,
      explanation,
      model: explanation ? this.runner.modelName : null,
      generatedAt: new Date().toISOString(),
    };
  }
}
