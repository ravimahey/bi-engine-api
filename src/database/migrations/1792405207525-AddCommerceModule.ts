import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommerceModule1792405207525 implements MigrationInterface {
  name = 'AddCommerceModule1792405207525';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create Enums if not exist
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."quote_status_enum" AS ENUM('draft', 'sent', 'accepted', 'declined', 'expired');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."order_status_enum" AS ENUM('submitted', 'ready_to_pack', 'pending_adjustment', 'confirmed', 'fulfilled', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."adjustment_status_enum" AS ENUM('none', 'pending', 'confirmed', 'rejected');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."commerce_invoice_status_enum" AS ENUM('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."commerce_payment_status_enum" AS ENUM('pending', 'succeeded', 'failed', 'refunded');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."commerce_payment_method_enum" AS ENUM('stripe', 'bank_transfer', 'credit_card', 'cash', 'other');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 2. Create quotes table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "quotes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "version" integer NOT NULL DEFAULT '1',
        "quote_number" character varying(50) NOT NULL,
        "organization_id" uuid NOT NULL,
        "supplier_id" uuid,
        "status" "public"."quote_status_enum" NOT NULL DEFAULT 'draft',
        "expiry_date" TIMESTAMP WITH TIME ZONE,
        "subtotal" numeric(12,2) NOT NULL DEFAULT '0',
        "tax" numeric(12,2) NOT NULL DEFAULT '0',
        "total" numeric(12,2) NOT NULL DEFAULT '0',
        "notes" text,
        "order_id" uuid,
        "items" jsonb NOT NULL DEFAULT '[]',
        CONSTRAINT "PK_quotes_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_quotes_org_status" ON "quotes" ("organization_id", "status")`,
    );

    // 3. Create commerce_orders table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "commerce_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "version" integer NOT NULL DEFAULT '1',
        "order_number" character varying(50) NOT NULL,
        "organization_id" uuid NOT NULL,
        "supplier_id" uuid,
        "buyer_id" uuid,
        "quote_id" uuid,
        "status" "public"."order_status_enum" NOT NULL DEFAULT 'submitted',
        "adjustment_status" "public"."adjustment_status_enum" NOT NULL DEFAULT 'none',
        "requested_total" numeric(12,2) NOT NULL DEFAULT '0',
        "adjusted_total" numeric(12,2),
        "final_total" numeric(12,2),
        "adjustment_reason" text,
        "packed_at" TIMESTAMP WITH TIME ZONE,
        "confirmed_at" TIMESTAMP WITH TIME ZONE,
        "notes" text,
        "items" jsonb NOT NULL DEFAULT '[]',
        CONSTRAINT "PK_commerce_orders_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_commerce_orders_org_status" ON "commerce_orders" ("organization_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_commerce_orders_quote" ON "commerce_orders" ("quote_id")`,
    );

    // 4. Create commerce_invoices table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "commerce_invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "version" integer NOT NULL DEFAULT '1',
        "invoice_number" character varying(50) NOT NULL,
        "organization_id" uuid NOT NULL,
        "order_id" uuid,
        "supplier_id" uuid,
        "buyer_id" uuid,
        "status" "public"."commerce_invoice_status_enum" NOT NULL DEFAULT 'draft',
        "issue_date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "due_date" TIMESTAMP WITH TIME ZONE NOT NULL,
        "subtotal" numeric(12,2) NOT NULL DEFAULT '0',
        "tax" numeric(12,2) NOT NULL DEFAULT '0',
        "total" numeric(12,2) NOT NULL DEFAULT '0',
        "amount_paid" numeric(12,2) NOT NULL DEFAULT '0',
        "balance_due" numeric(12,2) NOT NULL DEFAULT '0',
        "line_items" jsonb NOT NULL DEFAULT '[]',
        "notes" text,
        "paid_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_commerce_invoices_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_commerce_invoices_org_status" ON "commerce_invoices" ("organization_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_commerce_invoices_order" ON "commerce_invoices" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_commerce_invoices_due" ON "commerce_invoices" ("organization_id", "due_date")`,
    );

    // 5. Create commerce_payments table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "commerce_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "version" integer NOT NULL DEFAULT '1',
        "organization_id" uuid NOT NULL,
        "invoice_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL DEFAULT '0',
        "currency" character varying(10) NOT NULL DEFAULT 'USD',
        "payment_method" "public"."commerce_payment_method_enum" NOT NULL DEFAULT 'bank_transfer',
        "status" "public"."commerce_payment_status_enum" NOT NULL DEFAULT 'pending',
        "stripe_payment_intent_id" character varying(255),
        "stripe_charge_id" character varying(255),
        "receipt_url" text,
        "paid_at" TIMESTAMP WITH TIME ZONE,
        "refunded_at" TIMESTAMP WITH TIME ZONE,
        "failure_reason" text,
        "notes" text,
        CONSTRAINT "PK_commerce_payments_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_commerce_payments_invoice" ON "commerce_payments" ("invoice_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_commerce_payments_org" ON "commerce_payments" ("organization_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "commerce_payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "commerce_invoices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "commerce_orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quotes"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."commerce_payment_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."commerce_payment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."commerce_invoice_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."adjustment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."order_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."quote_status_enum"`);
  }
}
