import { ApiProperty } from '@nestjs/swagger';

/** Response shape for one row of the category spend breakdown, sorted by spend descending. */
export class CategorySpendDto {
  @ApiProperty({ format: 'uuid', nullable: true, example: null })
  categoryId: string | null;

  @ApiProperty({ nullable: true, example: 'Materials' })
  categoryName: string | null;

  @ApiProperty({ example: 6120.75 })
  totalSpend: number;

  @ApiProperty({ example: 42 })
  lineCount: number;
}
