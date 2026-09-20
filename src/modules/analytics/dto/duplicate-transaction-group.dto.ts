import { ApiProperty } from '@nestjs/swagger';

/**
 * One response row: same vendor + same date + same total amount appearing
 * more than once — the PDF's "ABC Supplies, $2,150, same date, twice"
 * example. Sorted by occurrences descending, so the most-repeated group
 * surfaces first.
 */
export class DuplicateTransactionGroupDto {
  @ApiProperty({ format: 'uuid', nullable: true, example: null })
  vendorId: string | null;

  @ApiProperty({ nullable: true, example: 'ABC Supplies' })
  vendorName: string | null;

  @ApiProperty({ example: '2026-08-16' })
  transactionDate: string;

  @ApiProperty({ example: 2150.0 })
  totalAmount: number;

  @ApiProperty({ example: 2 })
  occurrences: number;

  @ApiProperty({ type: [String], format: 'uuid' })
  transactionIds: string[];
}
