import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `vendors` (`modules/records`) — canonical supplier master data, Step 1 of
 * the QuickBooks API Build Order. Every Bill/Purchase/VendorCredit
 * references this.
 */
export class AddVendors1789276065004 implements MigrationInterface {
  name = 'AddVendors1789276065004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."vendors_source_system_enum" AS ENUM('quickbooks', 'xero', 'zoho', 'manual', 'csv')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vendors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "source_system" "public"."vendors_source_system_enum" NOT NULL, "source_external_id" character varying(100) NOT NULL, "source_connection_id" uuid, "display_name" character varying(255) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "balance" numeric(14,2), "email" character varying(255), "phone" character varying(50), CONSTRAINT "PK_9c956c9797edfae5c6ddacc4e6e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1b4dfadb7efb4fc3b5838de9b1" ON "vendors" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c72c33afdb46dbbcb05621da8a" ON "vendors" ("source_connection_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c49bcafa59e007108ef27a0188" ON "vendors" ("organization_id", "source_system", "source_external_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendors" ADD CONSTRAINT "FK_1b4dfadb7efb4fc3b5838de9b1f" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendors" ADD CONSTRAINT "FK_c72c33afdb46dbbcb05621da8a0" FOREIGN KEY ("source_connection_id") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vendors" DROP CONSTRAINT "FK_c72c33afdb46dbbcb05621da8a0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendors" DROP CONSTRAINT "FK_1b4dfadb7efb4fc3b5838de9b1f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c49bcafa59e007108ef27a0188"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c72c33afdb46dbbcb05621da8a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1b4dfadb7efb4fc3b5838de9b1"`,
    );
    await queryRunner.query(`DROP TABLE "vendors"`);
    await queryRunner.query(`DROP TYPE "public"."vendors_source_system_enum"`);
  }
}
