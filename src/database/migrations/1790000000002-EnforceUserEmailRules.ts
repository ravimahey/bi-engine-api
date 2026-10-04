import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes "one account per email" hold case-insensitively at the database
 * level. Every write path already lowercases emails, but the existing
 * `UQ`/`idx_users_email` constraint compares raw text, so a row written
 * before that normalization (or by any future path that forgets it) could
 * still sit beside its differently-cased twin.
 *
 * 1. Refuses to run if two accounts (soft-deleted ones included) differ only
 *    by case/whitespace — those need a human to decide which one survives.
 * 2. Lowercases/trims every stored email.
 * 3. Adds a unique index on `LOWER(email)`, built `CONCURRENTLY` so it
 *    doesn't block writes on a live `users` table — which is why this
 *    migration opts out of the wrapping transaction.
 */
export class EnforceUserEmailRules1790000000002 implements MigrationInterface {
  name = 'EnforceUserEmailRules1790000000002';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates = (await queryRunner.query(
      `SELECT LOWER(TRIM("email")) AS "email" FROM "users" GROUP BY 1 HAVING COUNT(*) > 1`,
    )) as { email: string }[];
    if (duplicates.length) {
      throw new Error(
        `Cannot enforce unique emails: these addresses belong to more than one account (ignoring case): ${duplicates
          .map((d) => d.email)
          .join(', ')}. Merge or rename those accounts, then re-run.`,
      );
    }

    await queryRunner.query(
      `UPDATE "users" SET "email" = LOWER(TRIM("email")) WHERE "email" <> LOWER(TRIM("email"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "idx_users_email_lower" ON "users" (LOWER("email"))`,
    );
  }

  /**
   * The lowercasing in up() is not undone — it changes no account's
   * identity. Plain (not CONCURRENTLY) drop: TypeORM's revert always wraps
   * in a transaction, and dropping an index is near-instant anyway.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_users_email_lower"`,
    );
  }
}
