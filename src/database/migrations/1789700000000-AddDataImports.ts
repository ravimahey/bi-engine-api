import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `data_imports` (`modules/imports`) — one row per uploaded CSV/Excel file:
 * its validation outcome (issues, summary), the normalized records waiting
 * for the user to confirm (`payload`, cleared on commit/discard), and
 * whether it was committed. Business data itself lands in the existing
 * canonical records/* tables with source_system = 'csv'.
 */
export class AddDataImports1789700000000 implements MigrationInterface {
  name = 'AddDataImports1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."data_imports_import_type_enum" AS ENUM('vendors', 'customers', 'categories', 'items', 'tax_rates', 'expenses', 'vendor_credits', 'bill_payments', 'sales', 'customer_payments')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."data_imports_status_enum" AS ENUM('validated', 'failed', 'committed', 'discarded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "data_imports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "created_by_id" uuid, "import_type" "public"."data_imports_import_type_enum" NOT NULL, "status" "public"."data_imports_status_enum" NOT NULL, "file_name" character varying(255) NOT NULL, "file_size" integer NOT NULL, "total_rows" integer NOT NULL, "error_count" integer NOT NULL, "warning_count" integer NOT NULL, "issues" jsonb NOT NULL DEFAULT '[]', "summary" jsonb, "payload" jsonb, "committed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_170aea53191b5c89deebf7dec39" PRIMARY KEY ("id"))`,
    );
    // Query shape: an organization's import history, newest first.
    await queryRunner.query(
      `CREATE INDEX "idx_data_imports_org_created" ON "data_imports" ("organization_id", "created_at")`,
    );
    // FK column — Postgres doesn't index it automatically (SET NULL on user delete scans it).
    await queryRunner.query(
      `CREATE INDEX "idx_data_imports_created_by" ON "data_imports" ("created_by_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "data_imports" ADD CONSTRAINT "FK_a9e9767df5e2bffe20f493e4e45" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "data_imports" ADD CONSTRAINT "FK_83e64a47c3dc6272faa69ae99e9" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "data_imports" DROP CONSTRAINT "FK_83e64a47c3dc6272faa69ae99e9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "data_imports" DROP CONSTRAINT "FK_a9e9767df5e2bffe20f493e4e45"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_data_imports_created_by"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_data_imports_org_created"`,
    );
    await queryRunner.query(`DROP TABLE "data_imports"`);
    await queryRunner.query(`DROP TYPE "public"."data_imports_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."data_imports_import_type_enum"`,
    );
  }
}
