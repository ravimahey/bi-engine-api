import { ApiProperty } from '@nestjs/swagger';
import { DuplicateTransactionGroupDto } from '@modules/analytics/dto';

export class DuplicateGroupExplanationDto {
  @ApiProperty({
    example:
      'Two records from ABC Supplies on 2026-08-16 for $2,150 - a possible duplicate.',
  })
  explanation: string;

  @ApiProperty({
    type: [String],
    example: ['Compare the invoice reference numbers.'],
  })
  checklist: string[];
}

/** The unchanged analytics group plus its AI explanation (null when not explained). */
export class ExplainedDuplicateGroupDto extends DuplicateTransactionGroupDto {
  @ApiProperty({ type: DuplicateGroupExplanationDto, nullable: true })
  explanation: DuplicateGroupExplanationDto | null;
}

/** Code-computed - the model never adds these up. */
export class DuplicateTotalsDto {
  @ApiProperty({ example: 3 })
  groupCount: number;

  @ApiProperty({ example: 6, description: 'Records across all groups' })
  possibleDuplicateRecords: number;

  @ApiProperty({
    example: 6450,
    description:
      'Most that could be double-counted: sum of amount x (occurrences - 1). Not a confirmed saving.',
  })
  possiblyDoubleCounted: number;
}

export class DuplicateSummaryDto {
  @ApiProperty({
    example: '3 groups could be double-counting up to $6,450 in total.',
  })
  summary: string;

  @ApiProperty({ type: [String] })
  limitations: string[];

  @ApiProperty()
  disclaimer: string;
}

export class ExplainedDuplicatesDto {
  @ApiProperty({ type: DuplicateTotalsDto })
  totals: DuplicateTotalsDto;

  @ApiProperty({ type: [ExplainedDuplicateGroupDto] })
  groups: ExplainedDuplicateGroupDto[];

  @ApiProperty({ type: DuplicateSummaryDto, nullable: true })
  explanation: DuplicateSummaryDto | null;

  @ApiProperty({
    example: 3,
    description: 'How many groups (the first N) carry an AI explanation',
  })
  explainedGroupCount: number;

  @ApiProperty({ nullable: true, example: 'gemini-3.6-flash' })
  model: string | null;

  @ApiProperty({ example: '2026-09-19T10:00:00.000Z' })
  generatedAt: string;
}
