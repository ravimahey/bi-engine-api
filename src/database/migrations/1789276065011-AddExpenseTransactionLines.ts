import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `expense_transaction_lines` (`modules/records`) — line-item grain for
 * spend transactions, the actual money-leak signal (Amount/Qty/UnitPrice at
 * line grain, not just the header total). Denormalizes `organization_id`/
 * `vendor_id`/`transaction_date` from its parent `expense_transactions` row
 * — see the composite-index comments below for the query shapes that earns.
 * Depends on `expense_transactions`, `vendors`, `spend_categories`, `items`,
 * `tax_rates` — must run after all of those.
 */
export class AddExpenseTransactionLines1789276065011 implements MigrationInterface {
  name = 'AddExpenseTransactionLines1789276065011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "expense_transaction_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "transaction_id" uuid NOT NULL, "external_line_id" character varying(100) NOT NULL, "organization_id" uuid NOT NULL, "vendor_id" uuid, "transaction_date" date NOT NULL, "category_id" uuid, "item_id" uuid, "tax_rate_id" uuid, "tax_code_external_ref" character varying(50), "description" text, "line_number" integer, "amount" numeric(14,2) NOT NULL, "quantity" numeric(14,4), "unit_price" numeric(14,4), "currency" character(3) NOT NULL DEFAULT 'USD', CONSTRAINT "PK_4aed0f59ef33d032ae1292a979d" PRIMARY KEY ("id"))`,
    );
    // FK-required indexes (Postgres doesn't create one automatically for a foreign key column).
    await queryRunner.query(
      `CREATE INDEX "IDX_e26a351781902db1be85512bf1" ON "expense_transaction_lines" ("vendor_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f0c3fea2ad9fbce5bc1d91a5db" ON "expense_transaction_lines" ("category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_04a00395fdc50441685025780c" ON "expense_transaction_lines" ("item_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_63ec8266cef0aea3c370526c4f" ON "expense_transaction_lines" ("tax_rate_id")`,
    );
    // Query shape: an item's unit-price trend over time — "flour spend went up".
    await queryRunner.query(
      `CREATE INDEX "idx_expense_transaction_lines_org_item_date" ON "expense_transaction_lines" ("organization_id", "item_id", "transaction_date")`,
    );
    // Query shape: a category's spend trend over time — category-level shift findings.
    await queryRunner.query(
      `CREATE INDEX "idx_expense_transaction_lines_org_category_date" ON "expense_transaction_lines" ("organization_id", "category_id", "transaction_date")`,
    );
    // Query shape: a vendor's spend trend over time — the core "supplier spend +25%" finding.
    await queryRunner.query(
      `CREATE INDEX "idx_expense_transaction_lines_org_vendor_date" ON "expense_transaction_lines" ("organization_id", "vendor_id", "transaction_date")`,
    );
    // Query shape: total spend for an org over a date range (dashboard/KPI totals).
    await queryRunner.query(
      `CREATE INDEX "idx_expense_transaction_lines_org_date" ON "expense_transaction_lines" ("organization_id", "transaction_date")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_378e387da353014bd6605aeb15" ON "expense_transaction_lines" ("transaction_id", "external_line_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transaction_lines" ADD CONSTRAINT "FK_32770ec77eddf0c1ce036bfa9d0" FOREIGN KEY ("transaction_id") REFERENCES "expense_transactions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transaction_lines" ADD CONSTRAINT "FK_e2fcf741f6475d2aec0b413fe44" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transaction_lines" ADD CONSTRAINT "FK_e26a351781902db1be85512bf15" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transaction_lines" ADD CONSTRAINT "FK_f0c3fea2ad9fbce5bc1d91a5dbf" FOREIGN KEY ("category_id") REFERENCES "spend_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transaction_lines" ADD CONSTRAINT "FK_04a00395fdc50441685025780ce" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transaction_lines" ADD CONSTRAINT "FK_63ec8266cef0aea3c370526c4fa" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "expense_transaction_lines" DROP CONSTRAINT "FK_63ec8266cef0aea3c370526c4fa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transaction_lines" DROP CONSTRAINT "FK_04a00395fdc50441685025780ce"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transaction_lines" DROP CONSTRAINT "FK_f0c3fea2ad9fbce5bc1d91a5dbf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transaction_lines" DROP CONSTRAINT "FK_e26a351781902db1be85512bf15"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transaction_lines" DROP CONSTRAINT "FK_e2fcf741f6475d2aec0b413fe44"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_transaction_lines" DROP CONSTRAINT "FK_32770ec77eddf0c1ce036bfa9d0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_378e387da353014bd6605aeb15"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_expense_transaction_lines_org_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_expense_transaction_lines_org_vendor_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_expense_transaction_lines_org_category_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_expense_transaction_lines_org_item_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_63ec8266cef0aea3c370526c4f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_04a00395fdc50441685025780c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f0c3fea2ad9fbce5bc1d91a5db"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e26a351781902db1be85512bf1"`,
    );
    await queryRunner.query(`DROP TABLE "expense_transaction_lines"`);
  }
}
