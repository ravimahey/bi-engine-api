import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `company_profiles` (`modules/records`) — canonical company profile, Step 0
 * of the QuickBooks API Build Order (mirrors CompanyInfo). One row per
 * (organization, source_system): a connection has exactly one company.
 */
export class AddCompanyProfiles1789276065003 implements MigrationInterface {
  name = 'AddCompanyProfiles1789276065003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."company_profiles_source_system_enum" AS ENUM('quickbooks', 'xero', 'zoho', 'manual', 'csv')`,
    );
    await queryRunner.query(
      `CREATE TABLE "company_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "source_system" "public"."company_profiles_source_system_enum" NOT NULL, "source_external_id" character varying(100) NOT NULL, "source_connection_id" uuid, "company_name" character varying(255) NOT NULL, "legal_name" character varying(255), "country" character varying(10), "fiscal_year_start_month" character varying(20), "base_currency" character(3), CONSTRAINT "PK_1980200b310bd1e2ac86aa1ae4a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1eace7c80b9d5d4c152d364248" ON "company_profiles" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7da934124d35ed8ea9bfdd79e0" ON "company_profiles" ("source_connection_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f12a849e5d3e7037f1ac56e92e" ON "company_profiles" ("organization_id", "source_system", "source_external_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_profiles" ADD CONSTRAINT "FK_1eace7c80b9d5d4c152d3642481" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_profiles" ADD CONSTRAINT "FK_7da934124d35ed8ea9bfdd79e03" FOREIGN KEY ("source_connection_id") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company_profiles" DROP CONSTRAINT "FK_7da934124d35ed8ea9bfdd79e03"`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_profiles" DROP CONSTRAINT "FK_1eace7c80b9d5d4c152d3642481"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f12a849e5d3e7037f1ac56e92e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7da934124d35ed8ea9bfdd79e0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1eace7c80b9d5d4c152d364248"`,
    );
    await queryRunner.query(`DROP TABLE "company_profiles"`);
    await queryRunner.query(
      `DROP TYPE "public"."company_profiles_source_system_enum"`,
    );
  }
}
