import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class PriceNegotiationDto {
  @ApiProperty({
    example:
      'We experienced unexpected cold storage freight increases, but we value our relationship and can agree to $14.50/kg for this batch.',
    description: 'Seller explanation or counter-proposal response',
  })
  @IsString()
  @IsNotEmpty()
  sellerResponse: string;

  @ApiPropertyOptional({
    example: 14.5,
    description: 'Seller proposed unit price in counter-offer',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  proposedPrice?: number;
}
