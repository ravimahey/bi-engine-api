import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { SpendChangePeriodQueryDto } from './spend-change-period-query.dto';

export class SupplierSpendChangeQueryDto extends SpendChangePeriodQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  vendorId: string;
}
