import { ApiProperty } from '@nestjs/swagger';
import { ASK_ANSWER_TYPES } from '../schemas';
import type { AskAnswerType } from '../schemas';

/** One approved-tool call and the raw structured result the answer is grounded in. */
export class AskFactDto {
  @ApiProperty({ example: 'get_top_categories' })
  tool: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  input: Record<string, unknown>;

  @ApiProperty({ description: 'Raw backend/BI output, unchanged' })
  result: unknown;
}

export class AskAnswerDto {
  @ApiProperty()
  answer: string;

  @ApiProperty({ enum: ASK_ANSWER_TYPES })
  answerType: AskAnswerType;

  @ApiProperty({ type: [String] })
  limitations: string[];

  @ApiProperty({ example: false })
  outOfScope: boolean;

  @ApiProperty({
    example: true,
    description:
      'False when the model text was withheld because it cited a figure not in `facts`',
  })
  verified: boolean;

  @ApiProperty({ type: [AskFactDto] })
  facts: AskFactDto[];

  @ApiProperty({ example: 'gemini-3.6-flash' })
  model: string;

  @ApiProperty({ example: '2026-09-19T10:00:00.000Z' })
  generatedAt: string;
}
