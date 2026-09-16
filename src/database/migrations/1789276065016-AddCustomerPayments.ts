import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `customer_payments` (`modules/records`) — canonical customer payment
 * records, Step 11 of the QuickBooks API Build Order (when an invoice was
 * actually paid, the revenue-side mirror of `transaction_payments`).
 * Depends on `customers`, so this migration must run after `AddCustomers`.
 */
export class AddCustomerPayments1789276065016 implements MigrationInterface {
  name = 'AddCustomerPayments1789276065016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."customer_payments_source_system_enum" AS ENUM('quickbooks', 'xero', 'zoho', 'manual', 'csv')`,
    );
    await queryRunner.query(
      `CREATE TABLE "customer_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "source_system" "public"."customer_payments_source_system_enum" NOT NULL, "source_external_id" character varying(100) NOT NULL, "source_connection_id" uuid, "customer_id" uuid, "payment_date" date NOT NULL, "total_amount" numeric(14,2) NOT NULL, "currency" character(3) NOT NULL DEFAULT 'USD', "applied_transactions" jsonb, CONSTRAINT "PK_49f9fc4bd44d957db20148928d1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_355a4cc9a441a5eae19bd29931" ON "customer_payments" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_049555fcce43eef2f0f92e1fb2" ON "customer_payments" ("source_connection_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8b70fa93238a9c5f2e7ba8210c" ON "customer_payments" ("organization_id", "source_system", "source_external_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dcd8ce2a4a8587ee8a1d6985e8" ON "customer_payments" ("customer_id")`,
    );
    // Query shape: payment timing / AR-aging reconciliation.
    await queryRunner.query(
      `CREATE INDEX "idx_customer_payments_org_date" ON "customer_payments" ("organization_id", "payment_date")`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_payments" ADD CONSTRAINT "FK_355a4cc9a441a5eae19bd299316" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_payments" ADD CONSTRAINT "FK_049555fcce43eef2f0f92e1fb29" FOREIGN KEY ("source_connection_id") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_payments" ADD CONSTRAINT "FK_dcd8ce2a4a8587ee8a1d6985e8b" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customer_payments" DROP CONSTRAINT "FK_dcd8ce2a4a8587ee8a1d6985e8b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_payments" DROP CONSTRAINT "FK_049555fcce43eef2f0f92e1fb29"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_payments" DROP CONSTRAINT "FK_355a4cc9a441a5eae19bd299316"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_customer_payments_org_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dcd8ce2a4a8587ee8a1d6985e8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8b70fa93238a9c5f2e7ba8210c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_049555fcce43eef2f0f92e1fb2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_355a4cc9a441a5eae19bd29931"`,
    );
    await queryRunner.query(`DROP TABLE "customer_payments"`);
    await queryRunner.query(
      `DROP TYPE "public"."customer_payments_source_system_enum"`,
    );
  }
}
