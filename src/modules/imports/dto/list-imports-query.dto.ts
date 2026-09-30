import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '@common/dto';
import { ImportType } from '../entities';

/** Query for `GET /imports` — one organization's import history. */
export class ListImportsQueryDto extends PaginationQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  organizationId: string;

  @ApiPropertyOptional({ enum: ImportType })
  @IsOptional()
  @IsEnum(ImportType)
  importType?: ImportType;
}
