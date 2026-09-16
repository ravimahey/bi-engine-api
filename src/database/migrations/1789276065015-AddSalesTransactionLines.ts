import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `sales_transaction_lines` (`modules/records`) — line-item grain for
 * revenue transactions, the revenue-side mirror of
 * `expense_transaction_lines`. Denormalizes `organization_id`/`customer_id`/
 * `transaction_date` from its parent `sales_transactions` row. Depends on
 * `sales_transactions`, `customers`, `spend_categories`, `items`,
 * `tax_rates` — must run after all of those.
 */
export class AddSalesTransactionLines1789276065015 implements MigrationInterface {
  name = 'AddSalesTransactionLines1789276065015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sales_transaction_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "transaction_id" uuid NOT NULL, "external_line_id" character varying(100) NOT NULL, "organization_id" uuid NOT NULL, "customer_id" uuid, "transaction_date" date NOT NULL, "category_id" uuid, "item_id" uuid, "tax_rate_id" uuid, "tax_code_external_ref" character varying(50), "description" text, "line_number" integer, "amount" numeric(14,2) NOT NULL, "quantity" numeric(14,4), "unit_price" numeric(14,4), "currency" character(3) NOT NULL DEFAULT 'USD', CONSTRAINT "PK_c9c68c724e906e64de2a52432f0" PRIMARY KEY ("id"))`,
    );
    // FK-required indexes (Postgres doesn't create one automatically for a foreign key column).
    await queryRunner.query(
      `CREATE INDEX "IDX_9ebca6016d19fd3c7ca344e4b7" ON "sales_transaction_lines" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_051844ec89bd868cb108cbf8fd" ON "sales_transaction_lines" ("category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ec182c98d6336743b357a04b78" ON "sales_transaction_lines" ("item_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ba26b0dea3b5265780bd194a4e" ON "sales_transaction_lines" ("tax_rate_id")`,
    );
    // Query shape: an item's unit-price trend over time.
    await queryRunner.query(
      `CREATE INDEX "idx_sales_transaction_lines_org_item_date" ON "sales_transaction_lines" ("organization_id", "item_id", "transaction_date")`,
    );
    // Query shape: a category's revenue trend over time.
    await queryRunner.query(
      `CREATE INDEX "idx_sales_transaction_lines_org_category_date" ON "sales_transaction_lines" ("organization_id", "category_id", "transaction_date")`,
    );
    // Query shape: a customer's revenue trend over time.
    await queryRunner.query(
      `CREATE INDEX "idx_sales_transaction_lines_org_customer_date" ON "sales_transaction_lines" ("organization_id", "customer_id", "transaction_date")`,
    );
    // Query shape: total revenue for an org over a date range (dashboard/KPI totals).
    await queryRunner.query(
      `CREATE INDEX "idx_sales_transaction_lines_org_date" ON "sales_transaction_lines" ("organization_id", "transaction_date")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3a462681e6e4270de2d69167b8" ON "sales_transaction_lines" ("transaction_id", "external_line_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transaction_lines" ADD CONSTRAINT "FK_6647745054d636382df434438d4" FOREIGN KEY ("transaction_id") REFERENCES "sales_transactions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transaction_lines" ADD CONSTRAINT "FK_8d39488e83ed91c3e4b8131c27e" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transaction_lines" ADD CONSTRAINT "FK_9ebca6016d19fd3c7ca344e4b70" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transaction_lines" ADD CONSTRAINT "FK_051844ec89bd868cb108cbf8fd6" FOREIGN KEY ("category_id") REFERENCES "spend_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transaction_lines" ADD CONSTRAINT "FK_ec182c98d6336743b357a04b788" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transaction_lines" ADD CONSTRAINT "FK_ba26b0dea3b5265780bd194a4e1" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales_transaction_lines" DROP CONSTRAINT "FK_ba26b0dea3b5265780bd194a4e1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transaction_lines" DROP CONSTRAINT "FK_ec182c98d6336743b357a04b788"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transaction_lines" DROP CONSTRAINT "FK_051844ec89bd868cb108cbf8fd6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transaction_lines" DROP CONSTRAINT "FK_9ebca6016d19fd3c7ca344e4b70"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transaction_lines" DROP CONSTRAINT "FK_8d39488e83ed91c3e4b8131c27e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_transaction_lines" DROP CONSTRAINT "FK_6647745054d636382df434438d4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3a462681e6e4270de2d69167b8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_sales_transaction_lines_org_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_sales_transaction_lines_org_customer_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_sales_transaction_lines_org_category_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_sales_transaction_lines_org_item_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ba26b0dea3b5265780bd194a4e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ec182c98d6336743b357a04b78"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_051844ec89bd868cb108cbf8fd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9ebca6016d19fd3c7ca344e4b7"`,
    );
    await queryRunner.query(`DROP TABLE "sales_transaction_lines"`);
  }
}
