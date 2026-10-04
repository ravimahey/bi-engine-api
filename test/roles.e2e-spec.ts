import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import type TestAgent from 'supertest/lib/agent';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

interface Envelope<T> {
  success: boolean;
  data: T;
  message: string;
}
interface Me {
  id: string;
  role: string;
  organizationId: string | null;
}
interface Paged<T> {
  items?: T[];
}
const body = <T>(res: { body: unknown }): T => (res.body as Envelope<T>).data;

/**
 * The three roles end to end — `admin | owner | support`. Writes rows, so
 * (like `signals.e2e-spec.ts`) it only runs against a local database:
 *
 *   DB_HOST=localhost DB_NAME=<a migrated scratch db> pnpm test:e2e roles
 */
const isLocalDatabase = ['localhost', '127.0.0.1'].includes(
  process.env.DB_HOST ?? '',
);
const describeLocal = isLocalDatabase ? describe : describe.skip;

const run = Date.now();
const PASSWORD = 'Str0ng!Passw0rd';
const emailFor = (label: string) => `roles-${label}-${run}@example.com`;

describeLocal('Roles (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let organizationId: string;

  const agent = () => request.agent(app.getHttpServer());

  async function signup(
    label: string,
    role?: string,
  ): Promise<{ agent: TestAgent; me: Me }> {
    const a = agent();
    await a
      .post('/api/v1/auth/signup')
      .send({
        email: emailFor(label),
        firstName: 'Roles',
        lastName: label,
        password: PASSWORD,
        ...(role ? { role } : {}),
      })
      .expect(201);
    const me = body<Me>(await a.get('/api/v1/auth/me').expect(200));
    return { agent: a, me };
  }

  async function login(label: string): Promise<TestAgent> {
    const a = agent();
    await a
      .post('/api/v1/auth/login')
      .send({ email: emailFor(label), password: PASSWORD })
      .expect(200);
    return a;
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
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (organizationId) {
        await dataSource.query(`DELETE FROM organizations WHERE id = $1`, [
          organizationId,
        ]);
      }
      await dataSource.query(`DELETE FROM users WHERE email LIKE $1`, [
        `roles-%-${run}@example.com`,
      ]);
    }
    await app?.close();
  });

  describe('signup', () => {
    it('makes a new account an owner when no role is given', async () => {
      const { me } = await signup('default');
      expect(me.role).toBe('owner');
      expect(me.organizationId).toBeNull();
    });

    it.each(['buyer', 'supplier', 'admin'])(
      'rejects the removed/privileged role "%s"',
      async (role) => {
        await agent()
          .post('/api/v1/auth/signup')
          .send({
            email: emailFor(`bad-${role}`),
            firstName: 'Roles',
            lastName: role,
            password: PASSWORD,
            role,
          })
          .expect(400);
      },
    );
  });

  describe('owner ↔ support flow', () => {
    let owner: TestAgent;
    let support: TestAgent;
    let supportId: string;
    let requestId: string;

    beforeAll(async () => {
      ({ agent: owner } = await signup('owner', 'owner'));
      const s = await signup('support', 'support');
      support = s.agent;
      supportId = s.me.id;
      expect(s.me.role).toBe('support');
    });

    it('lets an owner self-serve an organization', async () => {
      const res = await owner
        .post('/api/v1/organizations')
        .send({ name: `Roles Org ${run}`, slug: `roles-org-${run}` })
        .expect(201);
      organizationId = body<{ id: string }>(res).id;
      const me = body<Me>(await owner.get('/api/v1/auth/me').expect(200));
      expect(me.organizationId).toBe(organizationId);
    });

    it('never lets a support user self-serve an organization', async () => {
      await support
        .post('/api/v1/organizations')
        .send({ name: `Roles Sup ${run}`, slug: `roles-sup-${run}` })
        .expect(403);
    });

    it('shows the owner as the org owner to support users', async () => {
      const res = await support
        .get('/api/v1/support/organizations')
        .query({ organizationName: `Roles Org ${run}` })
        .expect(200);
      const items = (res.body as { data: unknown }).data as
        | { id: string; ownerName: string | null }[]
        | Paged<{ id: string; ownerName: string | null }>;
      const list = Array.isArray(items) ? items : (items.items ?? []);
      const org = list.find((o) => o.id === organizationId);
      expect(org?.ownerName).toBe('Roles owner');
    });

    it('lets support request access, and only the owner review it', async () => {
      const created = await support
        .post('/api/v1/support/requests')
        .send({ organizationId })
        .expect(201);
      requestId = body<{ id: string }>(created).id;

      // Owner-only routes are closed to support.
      await support.get('/api/v1/support/requests').expect(403);
      await support
        .patch(`/api/v1/support/requests/${requestId}`)
        .send({ status: 'approved' })
        .expect(403);

      await owner.get('/api/v1/support/requests').expect(200);
      await owner
        .patch(`/api/v1/support/requests/${requestId}`)
        .send({ status: 'approved' })
        .expect(200);
    });

    it('gives the approved support user the organization', async () => {
      const relogged = await login('support');
      const me = body<Me>(await relogged.get('/api/v1/auth/me').expect(200));
      expect(me.id).toBe(supportId);
      expect(me.organizationId).toBe(organizationId);
    });

    it('keeps support-only routes closed to the owner', async () => {
      await owner.get('/api/v1/support/organizations').expect(403);
      await owner
        .post('/api/v1/support/requests')
        .send({ organizationId })
        .expect(403);
    });
  });

  describe('admin', () => {
    it('counts owners and support users on the dashboard', async () => {
      await signup('admin');
      await dataSource.query(
        `UPDATE users SET role = 'admin' WHERE email = $1`,
        [emailFor('admin')],
      );
      const admin = await login('admin');
      const overview = body<{
        totalUsers: number;
        usersByRole: Record<string, number>;
      }>(await admin.get('/api/v1/admin/dashboard/overview').expect(200));

      expect(Object.keys(overview.usersByRole).sort()).toEqual([
        'owner',
        'support',
      ]);
      expect(overview.usersByRole.owner).toBeGreaterThanOrEqual(2);
      expect(overview.usersByRole.support).toBeGreaterThanOrEqual(1);
      expect(overview.totalUsers).toBe(
        overview.usersByRole.owner + overview.usersByRole.support,
      );
    });

    it('keeps admin routes closed to owners', async () => {
      const owner = await login('owner');
      await owner.get('/api/v1/admin/dashboard/overview').expect(403);
    });
  });
});
