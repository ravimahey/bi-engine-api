import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `tax_rates` (`modules/records`) — canonical tax rate definitions, Step 4
 * of the QuickBooks API Build Order. Kept separate from transaction line
 * amounts so a rate change never masquerades as a genuine price increase.
 */
export class AddTaxRates1789276065007 implements MigrationInterface {
  name = 'AddTaxRates1789276065007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."tax_rates_source_system_enum" AS ENUM('quickbooks', 'xero', 'zoho', 'manual', 'csv')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tax_rates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "source_system" "public"."tax_rates_source_system_enum" NOT NULL, "source_external_id" character varying(100) NOT NULL, "source_connection_id" uuid, "name" character varying(255) NOT NULL, "rate_percent" numeric(7,4) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_41164a748f3dafa373c7e508ca2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4c08ce7c0b8eaf3c8e5feed547" ON "tax_rates" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fd90627d33b428de8b8e602959" ON "tax_rates" ("source_connection_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d200878bc3d31060d6e9853efa" ON "tax_rates" ("organization_id", "source_system", "source_external_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tax_rates" ADD CONSTRAINT "FK_4c08ce7c0b8eaf3c8e5feed547d" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tax_rates" ADD CONSTRAINT "FK_fd90627d33b428de8b8e6029590" FOREIGN KEY ("source_connection_id") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tax_rates" DROP CONSTRAINT "FK_fd90627d33b428de8b8e6029590"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tax_rates" DROP CONSTRAINT "FK_4c08ce7c0b8eaf3c8e5feed547d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d200878bc3d31060d6e9853efa"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fd90627d33b428de8b8e602959"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4c08ce7c0b8eaf3c8e5feed547"`,
    );
    await queryRunner.query(`DROP TABLE "tax_rates"`);
    await queryRunner.query(
      `DROP TYPE "public"."tax_rates_source_system_enum"`,
    );
  }
}
