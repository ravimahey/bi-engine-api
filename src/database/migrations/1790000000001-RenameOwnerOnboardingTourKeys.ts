import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The frontend's role-based onboarding tour key follows the role
 * (`onboarding:<audience>`), so after buyer/supplier became `owner` an
 * existing user would otherwise be shown the owner onboarding from scratch.
 * Carries each user's buyer/supplier onboarding progress over to
 * `onboarding:owner` instead.
 *
 * `(user_id, tour_key)` is unique, so only one row per user can be renamed:
 * if a user somehow has both (an admin changed their role), the completed
 * one wins, then the most recently touched. Any leftover old row is
 * harmless — nothing reads it any more.
 */
export class RenameOwnerOnboardingTourKeys1790000000001 implements MigrationInterface {
  name = 'RenameOwnerOnboardingTourKeys1790000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "user_walkthroughs" w
      SET "tour_key" = 'onboarding:owner'
      WHERE w."id" = (
        SELECT w2."id" FROM "user_walkthroughs" w2
        WHERE w2."user_id" = w."user_id"
          AND w2."tour_key" IN ('onboarding:buyer', 'onboarding:supplier')
        ORDER BY (w2."status" = 'completed') DESC, w2."updated_at" DESC
        LIMIT 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM "user_walkthroughs" w3
        WHERE w3."user_id" = w."user_id"
          AND w3."tour_key" = 'onboarding:owner'
      )
    `);
  }

  /** Mirrors the role migration's down(): every owner returns as a buyer. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "user_walkthroughs" w
      SET "tour_key" = 'onboarding:buyer'
      WHERE w."tour_key" = 'onboarding:owner'
      AND NOT EXISTS (
        SELECT 1 FROM "user_walkthroughs" w3
        WHERE w3."user_id" = w."user_id"
          AND w3."tour_key" = 'onboarding:buyer'
      )
    `);
  }
}
