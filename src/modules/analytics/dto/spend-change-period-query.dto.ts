import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

/**
 * The two date windows a cost-increase finding compares — "current" vs
 * "prior" — plus the organization they're scoped to. Shared by the
 * supplier and category variants; each adds only the id of the entity
 * being compared.
 */
export class SpendChangePeriodQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  organizationId: string;

  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  currentFrom: string;

  @ApiProperty({ example: '2026-08-31' })
  @IsDateString()
  currentTo: string;

  @ApiProperty({ example: '2026-07-01' })
  @IsDateString()
  priorFrom: string;

  @ApiProperty({ example: '2026-07-31' })
  @IsDateString()
  priorTo: string;
}
