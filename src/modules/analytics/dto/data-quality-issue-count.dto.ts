import { ApiProperty } from '@nestjs/swagger';

/** Response shape for the dashboard's "Needs Review" badge — one COUNT over everything. */
export class DataQualityIssueCountDto {
  @ApiProperty({ example: 7 })
  count: number;
}
