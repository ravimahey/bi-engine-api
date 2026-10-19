import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class VerifyInvoiceDto {
  @ApiPropertyOptional({
    example: 'INV-1002-REV',
    description: 'Updated invoice number or credit note number from seller',
  })
  @IsOptional()
  @IsString()
  revisedInvoiceNumber?: string;

  @ApiPropertyOptional({
    example: 14.5,
    description: 'Unit price verified on final corrected invoice/credit note',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  verifiedPrice?: number;

  @ApiPropertyOptional({
    example: 'Credit note #CN-1002 applied for $300.00 difference. Final payable amount $2,900.00.',
    description: 'Verification notes or audit remarks',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
