import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `sales_transactions` (`modules/records`) — canonical revenue-transaction
 * header, Step 11 of the QuickBooks API Build Order (unifies Invoice and
 * SalesReceipt behind one `transaction_type`, the revenue-side mirror of
 * `expense_transactions`). Depends on `customers`, so this migration must
 * run after `AddCustomers`.
 */
export class AddSalesTransactions1789276065014 implements MigrationInterface {
  name = 'AddSalesTransactions1789276065014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."sales_transactions_source_system_enum" AS ENUM('quickbooks', 'xero', 'zoho', 'manual', 'csv')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sales_transactions_transaction_type_enum" AS ENUM('invoice', 'sales_receipt')`,
    );
    await queryRunner.query(
      `CREATE TABLE "sales_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "source_system" "public"."sales_transactions_source_system_enum" NOT NULL, "source_external_id" character varying(100) NOT NULL, "source_connection_id" uuid, "transaction_type" "public"."sales_transactions_transaction_type_enum" NOT NULL, "customer_id" uuid, "transaction_date" date NOT NULL, "due_date" date, "total_amount" numeric(14,2) NOT NULL, "currency" character(3) NOT NULL DEFAULT 'USD', "balance" numeric(14,2), "private_note" text, CONSTRAINT "PK_cb7b77aef6deb4566a38374e641" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_043864f461413823d62a68af47" ON "sales_transactions" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ebecb7c6bd505f067ea03f644d" ON "sales_transactions" ("source_connection_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e55bc4ebaacb423f29cdd7bd7d" ON "sales_transactions" ("organization_id", "source_system", "source_external_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_48a2433597e1fe9f859c061fb4" ON "sales_transactions" ("customer_id")`,
    );
    // Query shape: transaction-header list/pagination for an org over a date range (no line join needed).
    await queryRunner.query(
      `CREATE INDEX "idx_sales_transactions_org_date" ON "sales_transactions" ("organization_id", "transaction_date")`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transactions" ADD CONSTRAINT "FK_043864f461413823d62a68af474" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transactions" ADD CONSTRAINT "FK_ebecb7c6bd505f067ea03f644d5" FOREIGN KEY ("source_connection_id") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transactions" ADD CONSTRAINT "FK_48a2433597e1fe9f859c061fb48" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales_transactions" DROP CONSTRAINT "FK_48a2433597e1fe9f859c061fb48"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transactions" DROP CONSTRAINT "FK_ebecb7c6bd505f067ea03f644d5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transactions" DROP CONSTRAINT "FK_043864f461413823d62a68af474"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_sales_transactions_org_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_48a2433597e1fe9f859c061fb4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e55bc4ebaacb423f29cdd7bd7d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ebecb7c6bd505f067ea03f644d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_043864f461413823d62a68af47"`,
    );
    await queryRunner.query(`DROP TABLE "sales_transactions"`);
    await queryRunner.query(
      `DROP TYPE "public"."sales_transactions_transaction_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."sales_transactions_source_system_enum"`,
    );
  }
}
