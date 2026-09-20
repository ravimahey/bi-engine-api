import { ApiProperty } from '@nestjs/swagger';

/** Counts over the sampled rows only - not org-wide totals. */
export class DataQualitySampleDto {
  @ApiProperty({ example: 20 })
  sampleSize: number;

  @ApiProperty({ example: 14 })
  missingSupplier: number;

  @ApiProperty({ example: 6 })
  nonPositiveAmount: number;
}

export class DataQualityExplanationDto {
  @ApiProperty({ example: '7 transactions need review.' })
  headline: string;

  @ApiProperty()
  whyItMatters: string;

  @ApiProperty({
    type: [String],
    example: ['Add the supplier in your accounting system, then re-sync.'],
  })
  howToFix: string[];

  @ApiProperty({ type: [String] })
  limitations: string[];

  @ApiProperty()
  disclaimer: string;
}

export class ExplainedDataQualityDto {
  @ApiProperty({
    enum: ['good', 'needs_review'],
    description: 'Rule-based: needs_review when issueCount > 0',
  })
  status: 'good' | 'needs_review';

  @ApiProperty({ example: 7 })
  issueCount: number;

  @ApiProperty({ type: DataQualitySampleDto })
  sample: DataQualitySampleDto;

  @ApiProperty({ type: DataQualityExplanationDto, nullable: true })
  explanation: DataQualityExplanationDto | null;

  @ApiProperty({ nullable: true, example: 'gemini-3.6-flash' })
  model: string | null;

  @ApiProperty({ example: '2026-09-19T10:00:00.000Z' })
  generatedAt: string;
}
