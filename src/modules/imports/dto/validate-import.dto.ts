import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { ImportType } from '../entities';

/** Multipart form fields sent with the file to `POST /imports/validate`. */
export class ValidateImportDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Organization the data belongs to',
  })
  @IsUUID('4')
  organizationId: string;

  @ApiProperty({
    enum: ImportType,
    description: 'Which template the file follows',
  })
  @IsEnum(ImportType)
  importType: ImportType;
}
