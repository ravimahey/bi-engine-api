import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `tax_codes` (`modules/records`) — canonical tax code labels, Step 4 of the
 * QuickBooks API Build Order (alongside tax_rates). `primary_purchase_tax_rate_id`/
 * `primary_sales_tax_rate_id` are resolved canonical `tax_rates` FKs (not raw
 * external ids) — the mapper resolves them at sync time, so a transaction
 * line resolving its tax rate just follows this table's own FK. Depends on
 * `tax_rates`, so this migration must run after `AddTaxRates`.
 */
export class AddTaxCodes1789276065008 implements MigrationInterface {
  name = 'AddTaxCodes1789276065008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."tax_codes_source_system_enum" AS ENUM('quickbooks', 'xero', 'zoho', 'manual', 'csv')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tax_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "source_system" "public"."tax_codes_source_system_enum" NOT NULL, "source_external_id" character varying(100) NOT NULL, "source_connection_id" uuid, "name" character varying(255) NOT NULL, "description" character varying(255), "taxable" boolean NOT NULL DEFAULT false, "tax_group" boolean NOT NULL DEFAULT false, "is_active" boolean NOT NULL DEFAULT true, "primary_purchase_tax_rate_id" uuid, "primary_sales_tax_rate_id" uuid, CONSTRAINT "PK_657e27374d6b19b854df6111043" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6783eca9de20a46e21bd637307" ON "tax_codes" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_84f23437d2fc21ac318952c60e" ON "tax_codes" ("source_connection_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c0e51a4fe7867f9c9bf641ec9e" ON "tax_codes" ("organization_id", "source_system", "source_external_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_95e9be4789411535f7e29b2915" ON "tax_codes" ("primary_purchase_tax_rate_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2d265951422005cd5e083a8cfb" ON "tax_codes" ("primary_sales_tax_rate_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tax_codes" ADD CONSTRAINT "FK_6783eca9de20a46e21bd637307e" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tax_codes" ADD CONSTRAINT "FK_84f23437d2fc21ac318952c60ed" FOREIGN KEY ("source_connection_id") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tax_codes" ADD CONSTRAINT "FK_95e9be4789411535f7e29b2915c" FOREIGN KEY ("primary_purchase_tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tax_codes" ADD CONSTRAINT "FK_2d265951422005cd5e083a8cfbb" FOREIGN KEY ("primary_sales_tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tax_codes" DROP CONSTRAINT "FK_2d265951422005cd5e083a8cfbb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tax_codes" DROP CONSTRAINT "FK_95e9be4789411535f7e29b2915c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tax_codes" DROP CONSTRAINT "FK_84f23437d2fc21ac318952c60ed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tax_codes" DROP CONSTRAINT "FK_6783eca9de20a46e21bd637307e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2d265951422005cd5e083a8cfb"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_95e9be4789411535f7e29b2915"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c0e51a4fe7867f9c9bf641ec9e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_84f23437d2fc21ac318952c60e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6783eca9de20a46e21bd637307"`,
    );
    await queryRunner.query(`DROP TABLE "tax_codes"`);
    await queryRunner.query(
      `DROP TYPE "public"."tax_codes_source_system_enum"`,
    );
  }
}
