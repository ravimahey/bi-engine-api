import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { QuickbooksReportName } from '../types';

/** Path param for `GET /quickbooks/reports/:reportName`. */
export class QuickbooksReportParamsDto {
  @ApiProperty({ enum: QuickbooksReportName })
  @IsEnum(QuickbooksReportName)
  reportName: QuickbooksReportName;
}
