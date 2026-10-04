import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import type TestAgent from 'supertest/lib/agent';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { User } from '@modules/users/entities';

interface Me {
  id: string;
  email: string;
  firstName: string;
}
const body = <T>(res: { body: unknown }): T => (res.body as { data: T }).data;

/**
 * Email is set once at signup and is unique case-insensitively. Writes
 * rows, so (like `signals.e2e-spec.ts`) it only runs against a local DB:
 *
 *   DB_HOST=localhost DB_NAME=<a migrated scratch db> pnpm test:e2e email-rules
 */
const isLocalDatabase = ['localhost', '127.0.0.1'].includes(
  process.env.DB_HOST ?? '',
);
const describeLocal = isLocalDatabase ? describe : describe.skip;

const run = Date.now();
const PASSWORD = 'Str0ng!Passw0rd';
const emailFor = (label: string) => `email-${label}-${run}@example.com`;

describeLocal('Email rules (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let user: TestAgent;
  let userId: string;

  const signup = (email: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/signup').send({
      email,
      firstName: 'Email',
      lastName: 'Rules',
      password: PASSWORD,
    });

  async function login(email: string): Promise<TestAgent> {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return agent;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    dataSource = app.get(DataSource);

    await signup(emailFor('user')).expect(201);
    user = await login(emailFor('user'));
    userId = body<Me>(await user.get('/api/v1/auth/me').expect(200)).id;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DELETE FROM users WHERE email LIKE $1`, [
        `email-%-${run}@example.com`,
      ]);
    }
    await app?.close();
  });

  describe('profile update', () => {
    it('rejects any email change with a clear message', async () => {
      const res = await user
        .patch('/api/v1/auth/profile')
        .send({ email: emailFor('changed') })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('email cannot be changed');
    });

    it('rejects resending the same email too (no email field at all)', async () => {
      await user
        .patch('/api/v1/auth/profile')
        .send({ firstName: 'Same', email: emailFor('user') })
        .expect(400);
    });

    it('rejects an email sent as multipart form data', async () => {
      await user
        .patch('/api/v1/auth/profile')
        .field('email', emailFor('multipart'))
        .expect(400);
    });

    it('still updates the name and keeps the email intact', async () => {
      const res = await user
        .patch('/api/v1/auth/profile')
        .send({ firstName: 'Renamed' })
        .expect(200);
      expect(body<Me>(res)).toMatchObject({
        firstName: 'Renamed',
        email: emailFor('user'),
      });

      const me = body<Me>(await user.get('/api/v1/auth/me').expect(200));
      expect(me.email).toBe(emailFor('user'));
    });
  });

  describe('admin update', () => {
    it('rejects an admin changing a user email', async () => {
      await signup(emailFor('admin')).expect(201);
      await dataSource.query(
        `UPDATE users SET role = 'admin' WHERE email = $1`,
        [emailFor('admin')],
      );
      const admin = await login(emailFor('admin'));

      await admin
        .patch(`/api/v1/admin/users/${userId}`)
        .send({ email: emailFor('by-admin') })
        .expect(400);
      const res = await admin
        .patch(`/api/v1/admin/users/${userId}`)
        .send({ lastName: 'ByAdmin' })
        .expect(200);
      expect(body<Me>(res).email).toBe(emailFor('user'));
    });
  });

  describe('uniqueness', () => {
    it('rejects signing up again with the same email in any case', async () => {
      await signup(emailFor('user')).expect(409);
      await signup(emailFor('user').toUpperCase()).expect(409);
      await signup(`  ${emailFor('user')}  `).expect(409);
    });

    it('turns two concurrent signups for one email into one 201 and one 409', async () => {
      const email = emailFor('race');
      const statuses = (await Promise.all([signup(email), signup(email)]))
        .map((res) => res.status)
        .sort();
      expect(statuses).toEqual([201, 409]);
    });

    it('enforces case-insensitive uniqueness in the database itself', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO users (email, first_name, last_name) VALUES ($1, 'X', 'X')`,
          [emailFor('user').toUpperCase()],
        ),
      ).rejects.toThrow(/idx_users_email_lower/);
    });

    it('never writes email through an ORM save either', async () => {
      await dataSource.query(
        `UPDATE users SET first_name = 'Orm' WHERE id = $1`,
        [userId],
      );
      const repo = dataSource.getRepository(User);
      const row = await repo.findOneByOrFail({ id: userId });
      row.email = emailFor('orm-hack');
      await repo.save(row);
      const reloaded = await repo.findOneByOrFail({ id: userId });
      expect(reloaded.email).toBe(emailFor('user'));
    });
  });
});
