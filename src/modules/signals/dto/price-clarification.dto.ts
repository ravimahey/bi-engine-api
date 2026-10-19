import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class PriceClarificationDto {
  @ApiProperty({
    example:
      'Invoice #INV-1002 lists Tiger Prawns at $16.00/kg instead of agreed $14.00/kg. Please clarify the price increase.',
    description: 'Buyer question or clarification request sent to supplier',
  })
  @IsString()
  @IsNotEmpty()
  message: string;
}
