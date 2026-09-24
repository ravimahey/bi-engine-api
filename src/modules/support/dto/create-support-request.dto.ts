import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateSupportRequestDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The organization to request support access to',
  })
  @IsUUID('4', { message: 'organizationId must be a valid UUID' })
  organizationId: string;
}
