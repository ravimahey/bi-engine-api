import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `vendor_credits` (`modules/records`) — canonical vendor credit/refund
 * records, Step 7 of the QuickBooks API Build Order (nets a supplier refund
 * against the spend it originally hit). Depends on `vendors`, so this
 * migration must run after `AddVendors`.
 */
export class AddVendorCredits1789276065012 implements MigrationInterface {
  name = 'AddVendorCredits1789276065012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_credits_source_system_enum" AS ENUM('quickbooks', 'xero', 'zoho', 'manual', 'csv')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_credits" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "source_system" "public"."vendor_credits_source_system_enum" NOT NULL, "source_external_id" character varying(100) NOT NULL, "source_connection_id" uuid, "vendor_id" uuid, "transaction_date" date NOT NULL, "total_amount" numeric(14,2) NOT NULL, "currency" character(3) NOT NULL DEFAULT 'USD', "lines" jsonb, CONSTRAINT "PK_8256cae650819004f3da5714c9d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5a0d360a292c88d4baffc01e1c" ON "vendor_credits" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b64cd29ebbb8871d3f10f5c4b1" ON "vendor_credits" ("source_connection_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_14b45301cef865a4a6d511cb92" ON "vendor_credits" ("organization_id", "source_system", "source_external_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6b001885fc2615d751a074eb3f" ON "vendor_credits" ("vendor_id")`,
    );
    // Query shape: nets a credit against the spend it originally hit, over a date range.
    await queryRunner.query(
      `CREATE INDEX "idx_vendor_credits_org_date" ON "vendor_credits" ("organization_id", "transaction_date")`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_credits" ADD CONSTRAINT "FK_5a0d360a292c88d4baffc01e1cd" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_credits" ADD CONSTRAINT "FK_b64cd29ebbb8871d3f10f5c4b13" FOREIGN KEY ("source_connection_id") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_credits" ADD CONSTRAINT "FK_6b001885fc2615d751a074eb3fc" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vendor_credits" DROP CONSTRAINT "FK_6b001885fc2615d751a074eb3fc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_credits" DROP CONSTRAINT "FK_b64cd29ebbb8871d3f10f5c4b13"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_credits" DROP CONSTRAINT "FK_5a0d360a292c88d4baffc01e1cd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_vendor_credits_org_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6b001885fc2615d751a074eb3f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_14b45301cef865a4a6d511cb92"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b64cd29ebbb8871d3f10f5c4b1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5a0d360a292c88d4baffc01e1c"`,
    );
    await queryRunner.query(`DROP TABLE "vendor_credits"`);
    await queryRunner.query(
      `DROP TYPE "public"."vendor_credits_source_system_enum"`,
    );
  }
}
