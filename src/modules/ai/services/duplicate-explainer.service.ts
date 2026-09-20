import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@common/decorators';
import type { OrganizationIdQueryDto } from '@modules/analytics/dto';
import { DuplicateDetectionService } from '@modules/analytics/services';
import {
  DUPLICATE_SYSTEM_PROMPT,
  EXPLANATION_DISCLAIMER,
  MAX_EXPLAINED_DUPLICATE_GROUPS,
} from '../constants';
import type { ExplainedDuplicatesDto } from '../dto';
import { duplicateExplanationSchema } from '../schemas';
import {
  buildDuplicatePromptFacts,
  containsConfirmedDuplicateClaim,
} from '../utils';
import { ExplanationRunnerService } from './explanation-runner.service';

/**
 * Explains `DuplicateDetectionService`'s groups (LANGCHAIN_INTEGRATION_GUIDE.md
 * §3.2). The groups and every total come from BI; the model only words each
 * group and the overall summary, always as "possible" duplicates.
 */
@Injectable()
export class DuplicateExplainerService {
  constructor(
    private readonly duplicateDetection: DuplicateDetectionService,
    private readonly runner: ExplanationRunnerService,
  ) {}

  async explain(
    query: OrganizationIdQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<ExplainedDuplicatesDto> {
    // Runs the organization access check before any model call.
    const groups = await this.duplicateDetection.findPossibleDuplicates(
      query,
      currentUser,
    );

    const facts = buildDuplicatePromptFacts(
      groups,
      MAX_EXPLAINED_DUPLICATE_GROUPS,
    );
    const explainedCount = facts.groups.length;

    const output =
      explainedCount === 0
        ? null
        : await this.runner.run({
            label: 'duplicates',
            schema: duplicateExplanationSchema,
            systemPrompt: DUPLICATE_SYSTEM_PROMPT,
            facts,
            collectTexts: (o) => [
              o.summary,
              ...o.limitations,
              ...o.groups.flatMap((g) => [g.explanation, ...g.checklist]),
            ],
            hasUnsupportedClaim: containsConfirmedDuplicateClaim,
            isStructurallyValid: (o) => o.groups.length === explainedCount,
          });

    return {
      totals: facts.totals,
      groups: groups.map((group, index) => ({
        ...group,
        explanation:
          output && index < explainedCount
            ? {
                explanation: output.groups[index].explanation,
                checklist: output.groups[index].checklist,
              }
            : null,
      })),
      explanation: output && {
        summary: output.summary,
        limitations: output.limitations,
        disclaimer: EXPLANATION_DISCLAIMER,
      },
      explainedGroupCount: output ? explainedCount : 0,
      model: output ? this.runner.modelName : null,
      generatedAt: new Date().toISOString(),
    };
  }
}
