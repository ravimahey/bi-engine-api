import { ApiProperty } from '@nestjs/swagger';
import { CategorySpendDto, TotalSpendDto } from '@modules/analytics/dto';

export class CategoryShareDto extends CategorySpendDto {
  @ApiProperty({ example: 33.2, description: 'Share of total spend, percent' })
  sharePercent: number;
}

export class OtherCategoriesDto {
  @ApiProperty({ example: 2100.5 })
  totalSpend: number;

  @ApiProperty({ example: 11.4 })
  sharePercent: number;
}

export class CategoryIncreaseDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  categoryId: string | null;

  @ApiProperty({ example: 'Packaging' })
  categoryName: string;

  @ApiProperty({ example: 11000 })
  currentSpend: number;

  @ApiProperty({ example: 8000 })
  priorSpend: number;

  @ApiProperty({ example: 3000 })
  change: number;
}

export class SpendComparisonDto {
  @ApiProperty({ type: TotalSpendDto })
  prior: TotalSpendDto;

  @ApiProperty({ example: 3000 })
  spendChange: number;

  @ApiProperty({ nullable: true, example: 12.5 })
  spendChangePercent: number | null;

  @ApiProperty({
    type: [CategoryIncreaseDto],
    description: 'Biggest category increases, largest first',
  })
  categoryIncreases: CategoryIncreaseDto[];
}

export class ExpenseSummaryExplanationDto {
  @ApiProperty()
  headline: string;

  @ApiProperty()
  summary: string;

  @ApiProperty({ type: [String] })
  drivers: string[];

  @ApiProperty({ type: [String] })
  limitations: string[];

  @ApiProperty()
  disclaimer: string;
}

export class ExplainedExpenseSummaryDto {
  @ApiProperty({ type: TotalSpendDto })
  period: TotalSpendDto;

  @ApiProperty({ type: [CategoryShareDto] })
  topCategories: CategoryShareDto[];

  @ApiProperty({ type: OtherCategoriesDto, nullable: true })
  otherCategories: OtherCategoriesDto | null;

  @ApiProperty({ type: SpendComparisonDto, nullable: true })
  comparison: SpendComparisonDto | null;

  @ApiProperty({ type: ExpenseSummaryExplanationDto, nullable: true })
  explanation: ExpenseSummaryExplanationDto | null;

  @ApiProperty({ nullable: true, example: 'gemini-3.6-flash' })
  model: string | null;

  @ApiProperty({ example: '2026-09-19T10:00:00.000Z' })
  generatedAt: string;
}
