import { ApiProperty } from '@nestjs/swagger';

/** Swagger-only mirror of `OrganizationForSupport` so it renders in the docs. */
export class OrganizationForSupportResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Riverside Bistro' })
  name: string;

  @ApiProperty({ example: 'riverside-bistro' })
  slug: string;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Ada Lovelace',
    description: 'Null if this organization has no owner linked yet',
  })
  ownerName: string | null;

  @ApiProperty()
  createdAt: Date;
}
