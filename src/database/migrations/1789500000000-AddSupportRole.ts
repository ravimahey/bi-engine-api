import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `support` value to `users_role_enum`. Safe to run inside this
 * migration's own transaction (`migrationsTransactionMode: 'each'`) since
 * Postgres only forbids *using* a freshly added enum value in the same
 * transaction that added it — this migration only adds the value.
 */
export class AddSupportRole1789500000000 implements MigrationInterface {
  name = 'AddSupportRole1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" ADD VALUE 'support'`,
    );
  }

  /**
   * Postgres has no `DROP VALUE` for enums — the standard workaround is to
   * swap in a fresh type built from the remaining values. The `USING`
   * cast fails loudly (and correctly) if any row still has `role =
   * 'support'`, so this only succeeds once every support account has been
   * reassigned or removed.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'supplier', 'buyer')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::text::"public"."users_role_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'buyer'`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
  }
}
