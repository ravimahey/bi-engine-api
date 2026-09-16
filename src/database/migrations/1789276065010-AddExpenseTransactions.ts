import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `expense_transactions` (`modules/records`) — canonical spend-transaction
 * header, Step 5/6 of the QuickBooks API Build Order (unifies Bill and
 * Purchase behind one `transaction_type`). Depends on `vendors`, so this
 * migration must run after `AddVendors`.
 */
export class AddExpenseTransactions1789276065010 implements MigrationInterface {
  name = 'AddExpenseTransactions1789276065010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."expense_transactions_source_system_enum" AS ENUM('quickbooks', 'xero', 'zoho', 'manual', 'csv')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."expense_transactions_transaction_type_enum" AS ENUM('bill', 'purchase')`,
    );
    await queryRunner.query(
      `CREATE TABLE "expense_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "source_system" "public"."expense_transactions_source_system_enum" NOT NULL, "source_external_id" character varying(100) NOT NULL, "source_connection_id" uuid, "transaction_type" "public"."expense_transactions_transaction_type_enum" NOT NULL, "vendor_id" uuid, "transaction_date" date NOT NULL, "due_date" date, "total_amount" numeric(14,2) NOT NULL, "currency" character(3) NOT NULL DEFAULT 'USD', "balance" numeric(14,2), "payment_method" character varying(50), "private_note" text, CONSTRAINT "PK_90a17365bb493e63a93706668b5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_850b9208cffba66b77c6b76c3b" ON "expense_transactions" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_191474858e43e8eca92efca456" ON "expense_transactions" ("source_connection_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_814dfc57e00ac0ebbc9ee1ced8" ON "expense_transactions" ("organization_id", "source_system", "source_external_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f41a3ac6882e73eccf64858dd5" ON "expense_transactions" ("vendor_id")`,
    );
    // Query shape: transaction-header list/pagination for an org over a date range (no line join needed).
    await queryRunner.query(
      `CREATE INDEX "idx_expense_transactions_org_date" ON "expense_transactions" ("organization_id", "transaction_date")`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transactions" ADD CONSTRAINT "FK_850b9208cffba66b77c6b76c3bf" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transactions" ADD CONSTRAINT "FK_191474858e43e8eca92efca456f" FOREIGN KEY ("source_connection_id") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transactions" ADD CONSTRAINT "FK_f41a3ac6882e73eccf64858dd5c" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "expense_transactions" DROP CONSTRAINT "FK_f41a3ac6882e73eccf64858dd5c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transactions" DROP CONSTRAINT "FK_191474858e43e8eca92efca456f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transactions" DROP CONSTRAINT "FK_850b9208cffba66b77c6b76c3bf"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_expense_transactions_org_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f41a3ac6882e73eccf64858dd5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_814dfc57e00ac0ebbc9ee1ced8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_191474858e43e8eca92efca456"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_850b9208cffba66b77c6b76c3b"`,
    );
    await queryRunner.query(`DROP TABLE "expense_transactions"`);
    await queryRunner.query(
      `DROP TYPE "public"."expense_transactions_transaction_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."expense_transactions_source_system_enum"`,
    );
  }
}
