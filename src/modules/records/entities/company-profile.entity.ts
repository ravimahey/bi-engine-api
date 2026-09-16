import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';
import { ProvenancedRecordEntity } from './provenanced-record.entity';

/**
 * Canonical company profile — Step 0 of the build order. Confirms the
 * connection and captures fiscal year start / base currency before
 * anything else is pulled. One row per (organization, sourceSystem): a
 * connection has exactly one company, so `sourceExternalId` is that
 * provider's own realm/company id.
 */
@Entity({ name: 'company_profiles' })
export class CompanyProfile extends ProvenancedRecordEntity {
  @ApiProperty({ example: 'Sandbox Company US 5e41' })
  @Column({ type: 'varchar', length: 255, name: 'company_name' })
  companyName: string;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'varchar', length: 255, name: 'legal_name', nullable: true })
  legalName: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'varchar', length: 10, nullable: true })
  country: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'January' })
  @Column({
    type: 'varchar',
    length: 20,
    name: 'fiscal_year_start_month',
    nullable: true,
  })
  fiscalYearStartMonth: string | null;

  /** Not every provider reports a currency for single-currency companies. */
  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'char', length: 3, name: 'base_currency', nullable: true })
  baseCurrency: string | null;
}
