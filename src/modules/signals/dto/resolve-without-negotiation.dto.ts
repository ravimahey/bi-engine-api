import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ResolveWithoutNegotiationDto {
  @ApiProperty({
    example: 'Accept Price Increase (Approved Contractual / Market Rate)',
    description: 'The justification or category for resolving without supplier negotiation',
  })
  @IsString()
  reason: string;

  @ApiPropertyOptional({
    example: 'Annual CPI price escalation clause verified in master vendor agreement.',
    description: 'Additional notes or audit explanation',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
