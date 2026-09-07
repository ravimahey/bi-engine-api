import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Use on routes with a `:id` uuid path param: `@Param() { id }: IdParamDto`. */
export class IdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'id must be a valid UUID' })
  id: string;
}
