import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { validationExceptionFactory } from '@common/filters';
import type { PaginationMeta } from '@common/interfaces/api-response.interface';

/** Typed view over `response.body`, which supertest exposes as `any`. */
interface Envelope<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta;
  details?: Record<string, string[]>;
}

const body = <T>(res: { body: unknown }): Envelope<T> =>
  res.body as Envelope<T>;

interface UserPayload {
  id: string;
  email: string;
  firstName: string;
}

/**
 * Hits a real database — run `pnpm db:up && pnpm migration:run` first.
 * Mirrors the bootstrap in main.ts so the e2e surface matches production.
 */
describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let createdId: string;
  const email = `e2e-${Date.now()}@example.com`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health reports the database as up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    const payload = body<{ status: string }>(res);

    expect(payload.success).toBe(true);
    expect(payload.data.status).toBe('ok');
  });

  it('POST /api/v1/users creates a user and never returns the password hash', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        email,
        firstName: 'E2E',
        lastName: 'Tester',
        password: 'Str0ng!Pass',
      })
      .expect(201);

    const payload = body<UserPayload>(res);

    expect(payload).toMatchObject({ success: true, statusCode: 201 });
    expect(payload.data.email).toBe(email);
    expect(payload.data).not.toHaveProperty('passwordHash');

    createdId = payload.data.id;
  });

  it('POST /api/v1/users rejects invalid payloads with field-level details', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        email: 'nope',
        firstName: '',
        lastName: 'X',
        password: 'weak',
        extra: true,
      })
      .expect(400);

    const payload = body<null>(res);

    expect(payload.message).toBe('Validation failed');
    expect(payload.details).toHaveProperty('email');
    expect(payload.details).toHaveProperty('extra');
  });

  it('POST /api/v1/users returns 409 on a duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        email,
        firstName: 'Dup',
        lastName: 'Tester',
        password: 'Str0ng!Pass',
      })
      .expect(409);
  });

  it('GET /api/v1/users returns the paginated envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .query({ page: 1, limit: 2 })
      .expect(200);

    const payload = body<UserPayload[]>(res);

    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data.length).toBeLessThanOrEqual(2);
    expect(payload.meta).toMatchObject({ page: 1, limit: 2 });
  });

  it('GET /api/v1/users/:id rejects a malformed uuid', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/not-a-uuid')
      .expect(400);

    expect(body<null>(res).details?.id).toContain('id must be a valid UUID');
  });

  it('DELETE then GET yields 404, and restore brings the user back', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/users/${createdId}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/v1/users/${createdId}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${createdId}/restore`)
      .expect(200);
  });
});
