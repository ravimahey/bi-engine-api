import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SupportRequestStatus } from '../entities';

/** An owner's decision — never `PENDING`, that's only ever the initial state. */
export const REVIEW_DECISIONS = [
  SupportRequestStatus.APPROVED,
  SupportRequestStatus.REJECTED,
] as const;

export class ReviewSupportRequestDto {
  @ApiProperty({ enum: REVIEW_DECISIONS })
  @IsIn(REVIEW_DECISIONS, {
    message: `status must be one of: ${REVIEW_DECISIONS.join(', ')}`,
  })
  status: (typeof REVIEW_DECISIONS)[number];
}
