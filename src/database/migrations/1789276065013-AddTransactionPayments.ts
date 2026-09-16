import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `transaction_payments` (`modules/records`) — canonical payment records,
 * Step 8 of the QuickBooks API Build Order (when a bill was actually paid,
 * the "Reported" vs "Observed" value gap). Depends on `vendors`, so this
 * migration must run after `AddVendors`.
 */
export class AddTransactionPayments1789276065013 implements MigrationInterface {
  name = 'AddTransactionPayments1789276065013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."transaction_payments_source_system_enum" AS ENUM('quickbooks', 'xero', 'zoho', 'manual', 'csv')`,
    );
    await queryRunner.query(
      `CREATE TABLE "transaction_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "source_system" "public"."transaction_payments_source_system_enum" NOT NULL, "source_external_id" character varying(100) NOT NULL, "source_connection_id" uuid, "vendor_id" uuid, "payment_date" date NOT NULL, "total_amount" numeric(14,2) NOT NULL, "currency" character(3) NOT NULL DEFAULT 'USD', "payment_method" character varying(50), "applied_transactions" jsonb, CONSTRAINT "PK_324e77bea070ff5e6822f478da1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_47b5cfe0010bebda64bd3565a4" ON "transaction_payments" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_44a64e6d498a8ff8e5c370bb72" ON "transaction_payments" ("source_connection_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2d340bc92468666d31cc2997af" ON "transaction_payments" ("organization_id", "source_system", "source_external_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3626f0f1cd3d105fcd24e5bf2c" ON "transaction_payments" ("vendor_id")`,
    );
    // Query shape: payment timing / AP-aging — "Reported" vs "Observed" value reconciliation.
    await queryRunner.query(
      `CREATE INDEX "idx_transaction_payments_org_date" ON "transaction_payments" ("organization_id", "payment_date")`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_payments" ADD CONSTRAINT "FK_47b5cfe0010bebda64bd3565a42" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_payments" ADD CONSTRAINT "FK_44a64e6d498a8ff8e5c370bb724" FOREIGN KEY ("source_connection_id") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_payments" ADD CONSTRAINT "FK_3626f0f1cd3d105fcd24e5bf2c8" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_payments" DROP CONSTRAINT "FK_3626f0f1cd3d105fcd24e5bf2c8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_payments" DROP CONSTRAINT "FK_44a64e6d498a8ff8e5c370bb724"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_payments" DROP CONSTRAINT "FK_47b5cfe0010bebda64bd3565a42"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_transaction_payments_org_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3626f0f1cd3d105fcd24e5bf2c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2d340bc92468666d31cc2997af"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_44a64e6d498a8ff8e5c370bb72"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_47b5cfe0010bebda64bd3565a4"`,
    );
    await queryRunner.query(`DROP TABLE "transaction_payments"`);
    await queryRunner.query(
      `DROP TYPE "public"."transaction_payments_source_system_enum"`,
    );
  }
}
