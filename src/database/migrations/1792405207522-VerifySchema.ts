import { MigrationInterface, QueryRunner } from 'typeorm';

export class VerifySchema1792405207522 implements MigrationInterface {
  name = 'VerifySchema1792405207522';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organization_users" DROP CONSTRAINT "FK_org_users_invited_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_users" DROP CONSTRAINT "FK_org_users_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_users" DROP CONSTRAINT "FK_org_users_organization"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" DROP CONSTRAINT "FK_support_requests_reviewed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" DROP CONSTRAINT "FK_support_requests_organization"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" DROP CONSTRAINT "FK_support_requests_requester"`,
    );
    await queryRunner.query(
      `ALTER TABLE "signals" DROP CONSTRAINT "FK_signals_organization"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_walkthroughs" DROP CONSTRAINT "FK_user_walkthroughs_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_users" ADD CONSTRAINT "FK_095c5c2bd5c0e3d7e899e5b20e6" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_users" ADD CONSTRAINT "FK_850fda09e6a73f03b7949ddc06c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_users" ADD CONSTRAINT "FK_6cc3bf1480f7c41f3fa8242d9c0" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" ADD CONSTRAINT "FK_ceb83cf55bec3f553ec9e8ca1ad" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" ADD CONSTRAINT "FK_1e42629d6d32a97242264fa38a5" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" ADD CONSTRAINT "FK_ee3b03184a3361e9bb9a6f7682d" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "signals" ADD CONSTRAINT "FK_8a13b182a12515522337948f49f" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_walkthroughs" ADD CONSTRAINT "FK_d2929ed58ec3863e407976c6ca1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_walkthroughs" DROP CONSTRAINT "FK_d2929ed58ec3863e407976c6ca1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "signals" DROP CONSTRAINT "FK_8a13b182a12515522337948f49f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" DROP CONSTRAINT "FK_ee3b03184a3361e9bb9a6f7682d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" DROP CONSTRAINT "FK_1e42629d6d32a97242264fa38a5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" DROP CONSTRAINT "FK_ceb83cf55bec3f553ec9e8ca1ad"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_users" DROP CONSTRAINT "FK_6cc3bf1480f7c41f3fa8242d9c0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_users" DROP CONSTRAINT "FK_850fda09e6a73f03b7949ddc06c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_users" DROP CONSTRAINT "FK_095c5c2bd5c0e3d7e899e5b20e6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_walkthroughs" ADD CONSTRAINT "FK_user_walkthroughs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "signals" ADD CONSTRAINT "FK_signals_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" ADD CONSTRAINT "FK_support_requests_requester" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" ADD CONSTRAINT "FK_support_requests_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" ADD CONSTRAINT "FK_support_requests_reviewed_by" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_users" ADD CONSTRAINT "FK_org_users_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_users" ADD CONSTRAINT "FK_org_users_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_users" ADD CONSTRAINT "FK_org_users_invited_by" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }
}
