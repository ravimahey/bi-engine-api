import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * `organizationId` stays caller-supplied (an admin picks which organization
 * to ask about) and is validated against the caller's own organization for
 * any non-admin before any tool or model call - same contract as every
 * other org-scoped DTO. The model never chooses it.
 */
export class AskQuestionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  organizationId: string;

  @ApiProperty({
    example: 'Which supplier had the biggest spend increase in August?',
    minLength: 3,
    maxLength: 500,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  question: string;
}
