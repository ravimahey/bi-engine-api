import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class RevisedAgreementDto {
  @ApiProperty({
    example: 14.5,
    description: 'Final mutually agreed revised unit price',
  })
  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  agreedPrice: number;

  @ApiPropertyOptional({
    example: 'Seller agreed to $14.50/kg for invoice #INV-1002. Saving $300.00 against original $16/kg.',
    description: 'Notes on revised agreement terms',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
