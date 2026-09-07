import { ApiProperty } from '@nestjs/swagger';

/** Swagger-only mirror of `PaginationMeta` so it renders in the docs. */
export class PaginationMetaDto {
  @ApiProperty({ example: 137 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 7 })
  totalPages: number;

  @ApiProperty({ example: false })
  hasPreviousPage: boolean;

  @ApiProperty({ example: true })
  hasNextPage: boolean;
}
