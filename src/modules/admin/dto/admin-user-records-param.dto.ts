import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { IdParamDto } from '@common/dto';
import { ADMIN_RECORD_TYPES } from '../constants';
import type { AdminRecordType } from '../constants';

export class AdminUserRecordsParamDto extends IdParamDto {
  @ApiProperty({ enum: ADMIN_RECORD_TYPES })
  @IsIn(ADMIN_RECORD_TYPES)
  type: AdminRecordType;
}
