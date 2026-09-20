import { ApiProperty } from '@nestjs/swagger';
import { SpendChangeDto } from '@modules/analytics/dto';
import { SUGGESTED_OPTIONS } from '../constants';
import type { SuggestedOptionName } from '../constants';

export class SuggestedOptionDto {
  @ApiProperty({ enum: SUGGESTED_OPTIONS, example: 'Negotiate' })
  option: SuggestedOptionName;

  @ApiProperty({ type: [String], example: ['Direct impact on unit price'] })
  pros: string[];

  @ApiProperty({ type: [String], example: ['Supplier may push back'] })
  cons: string[];
}

/** Model-written, advisory text — every figure in it is checked against the finding. */
export class CostIncreaseExplanationDto {
  @ApiProperty({ example: 'Packaging spend rose 37.5% ($8,000 → $11,000).' })
  headline: string;

  @ApiProperty({
    example:
      'Quantity stayed flat at 1,000 units, so the increase came from a higher cost per unit.',
  })
  whatHappened: string;

  @ApiProperty({
    example: 'Price-driven increases are worth reviewing with the supplier.',
  })
  whyItMatters: string;

  @ApiProperty({
    type: [String],
    example: ['No invoice-level price history, so the cause is unknown.'],
  })
  limitations: string[];

  @ApiProperty({ type: [SuggestedOptionDto] })
  suggestedOptions: SuggestedOptionDto[];

  @ApiProperty()
  disclaimer: string;
}

/**
 * The deterministic finding, unchanged, plus an optional AI explanation.
 * `explanation` is null when AI is off, Gemini failed or timed out, or the
 * text cited a figure not in the finding — callers always still get the
 * numbers.
 */
export class ExplainedCostIncreaseDto {
  @ApiProperty({ example: 'Packaging' })
  subjectName: string;

  @ApiProperty({ type: SpendChangeDto })
  finding: SpendChangeDto;

  @ApiProperty({ type: CostIncreaseExplanationDto, nullable: true })
  explanation: CostIncreaseExplanationDto | null;

  @ApiProperty({ nullable: true, example: 'gemini-3.6-flash' })
  model: string | null;

  @ApiProperty({ example: '2026-09-19T10:00:00.000Z' })
  generatedAt: string;
}
