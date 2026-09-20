import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, ValidateIf } from 'class-validator';
import { ExpenseSummaryQueryDto } from '@modules/analytics/dto';

/**
 * The analytics summary window plus an optional prior window to compare
 * against. `priorFrom`/`priorTo` are both-or-neither: giving one makes the
 * other required.
 */
export class ExpenseSummaryExplainQueryDto extends ExpenseSummaryQueryDto {
  @ApiPropertyOptional({ example: '2026-07-01' })
  @ValidateIf((o: ExpenseSummaryExplainQueryDto) => o.priorTo !== undefined)
  @IsDateString()
  priorFrom?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @ValidateIf((o: ExpenseSummaryExplainQueryDto) => o.priorFrom !== undefined)
  @IsDateString()
  priorTo?: string;
}
