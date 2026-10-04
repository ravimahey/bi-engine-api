import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Business-profile columns on `organizations`, filled by the onboarding
 * wizard (`OrganizationProfileDto`). Every column is nullable or defaults
 * to an empty array, so existing rows stay valid with no backfill and the
 * `ADD COLUMN`s are metadata-only (no table rewrite). No indexes: nothing
 * filters, sorts or joins on these columns yet.
 */
export class AddOrganizationProfile1789900000000 implements MigrationInterface {
  name = 'AddOrganizationProfile1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations"
        ADD COLUMN "trading_name" character varying(255),
        ADD COLUMN "business_number" character varying(50),
        ADD COLUMN "country" character varying(2),
        ADD COLUMN "region" character varying(100),
        ADD COLUMN "street_address" character varying(255),
        ADD COLUMN "city" character varying(100),
        ADD COLUMN "postcode" character varying(10),
        ADD COLUMN "timezone" character varying(64),
        ADD COLUMN "business_types" text array NOT NULL DEFAULT '{}',
        ADD COLUMN "location_count" character varying(20),
        ADD COLUMN "monthly_volume" character varying(20),
        ADD COLUMN "goals" text array NOT NULL DEFAULT '{}',
        ADD COLUMN "integrations" text array NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations"
        DROP COLUMN "integrations",
        DROP COLUMN "goals",
        DROP COLUMN "monthly_volume",
        DROP COLUMN "location_count",
        DROP COLUMN "business_types",
        DROP COLUMN "timezone",
        DROP COLUMN "postcode",
        DROP COLUMN "city",
        DROP COLUMN "street_address",
        DROP COLUMN "region",
        DROP COLUMN "country",
        DROP COLUMN "business_number",
        DROP COLUMN "trading_name"`,
    );
  }
}
