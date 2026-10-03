import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import type TestAgent from 'supertest/lib/agent';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { FindingSignalsService } from '@modules/analytics/services';
import {
  ConnectionStatus,
  ProviderConnection,
  ProviderType,
} from '@modules/providers/entities';
import { ProviderConnectionsService } from '@modules/providers/services';
import {
  ExpenseTransaction,
  ExpenseTransactionLine,
  ExpenseTransactionType,
  SourceSystem,
  SpendCategory,
  Vendor,
} from '@modules/records/entities';
import {
  Signal,
  SignalSeverity,
  SignalStatus,
  SignalType,
} from '@modules/signals/entities';
import { SignalsService } from '@modules/signals/services';

interface Envelope<T> {
  success: boolean;
  data: T;
  message: string;
}
interface Feed {
  items: Signal[];
  nextCursor: string | null;
}
const body = <T>(res: { body: unknown }): T => (res.body as Envelope<T>).data;

/**
 * These tests write rows, so they only ever run against a local database:
 * the project `.env` may point at a shared/hosted one. Run with
 *
 *   DB_HOST=localhost DB_NAME=<a migrated scratch db> pnpm test:e2e signals
 *
 * (the process environment wins over `.env`). Anything else skips the suite.
 */
const isLocalDatabase = ['localhost', '127.0.0.1'].includes(
  process.env.DB_HOST ?? '',
);
const describeLocal = isLocalDatabase ? describe : describe.skip;

const run = Date.now();
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** Fixed "now" for the BI detectors: September 2026, so August vs July is the comparison. */
const TODAY = new Date('2026-09-30T12:00:00.000Z');

describeLocal('Signals (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let signals: SignalsService;
  let providerConnections: ProviderConnectionsService;
  let findingSignals: FindingSignalsService;

  let buyer: TestAgent;
  let supplier: TestAgent;
  let buyerOrg: string;
  let supplierOrg: string;

  const signalsOf = (organizationId: string, type: SignalType) =>
    dataSource.getRepository(Signal).find({
      where: { organizationId, type },
      order: { createdAt: 'ASC' },
    });

  /** Signs a new user up and gives them an organization — the agent keeps the session cookies. */
  async function createMember(role: 'buyer' | 'supplier') {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/signup')
      .send({
        email: `signals-${role}-${run}@example.com`,
        firstName: 'Signals',
        lastName: role,
        password: 'Str0ng!Passw0rd',
        role,
      })
      .expect(201);
    const res = await agent
      .post('/api/v1/organizations')
      .send({ name: `Signals ${role} ${run}`, slug: `signals-${role}-${run}` })
      .expect(201);
    return { agent, organizationId: body<{ id: string }>(res).id };
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
    signals = app.get(SignalsService);
    providerConnections = app.get(ProviderConnectionsService);
    findingSignals = app.get(FindingSignalsService);

    ({ agent: buyer, organizationId: buyerOrg } = await createMember('buyer'));
    ({ agent: supplier, organizationId: supplierOrg } =
      await createMember('supplier'));
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      // Signals, connections and records all cascade from the organization.
      await dataSource.query(
        `DELETE FROM organizations WHERE id = ANY($1::uuid[])`,
        [[buyerOrg, supplierOrg].filter(Boolean)],
      );
      await dataSource.query(`DELETE FROM users WHERE email LIKE $1`, [
        `signals-%-${run}@example.com`,
      ]);
    }
    await app?.close();
  });

  describe('Commerce-style events through the single entry point', () => {
    const order = uuid(1);
    const invoice = uuid(2);

    it('order → pending_adjustment raises exactly one order_needs_action for the buyer org', async () => {
      const input = {
        organizationId: buyerOrg,
        type: SignalType.ORDER_NEEDS_ACTION,
        sourceId: order,
        message:
          'Order #ORD-T7KA38 has an adjustment awaiting your confirmation.',
      };
      const first = await signals.createSignal(input);
      const again = await signals.createSignal(input); // same event re-processed

      expect(again?.id).toBe(first?.id);
      const rows = await signalsOf(buyerOrg, SignalType.ORDER_NEEDS_ACTION);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        severity: 'warning',
        sourceType: 'order',
        sourceId: order,
        status: 'unread',
        title: 'Order needs your confirmation',
        dismissedBy: null,
      });
    });

    it('the database itself refuses a second active signal for the same source', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO signals (organization_id, type, severity, title, message, source_type, source_id)
           VALUES ($1, 'order_needs_action', 'warning', 't', 'm', 'order', $2)`,
          [buyerOrg, order],
        ),
      ).rejects.toThrow(/idx_signals_dedup_active/);
    });

    it('supplier-side signals go to the supplier org only', async () => {
      await signals.createSignal({
        organizationId: supplierOrg,
        type: SignalType.ORDER_READY_TO_PACK,
        sourceId: order,
        message: 'Order #ORD-T7KA38 from Riverside Bistro is awaiting packing.',
      });
      await signals.createSignal({
        organizationId: supplierOrg,
        type: SignalType.ADJUSTMENT_REJECTED,
        sourceId: order,
        message:
          'Riverside Bistro rejected the packed-quantity adjustment on Order #ORD-T7KA38.',
      });

      expect(
        await signalsOf(supplierOrg, SignalType.ORDER_READY_TO_PACK),
      ).toHaveLength(1);
      expect(
        await signalsOf(supplierOrg, SignalType.ADJUSTMENT_REJECTED),
      ).toHaveLength(1);
      expect(
        await signalsOf(buyerOrg, SignalType.ORDER_READY_TO_PACK),
      ).toHaveLength(0);
    });

    it('confirming the order elsewhere auto-dismisses the signal as system', async () => {
      const resolved = await signals.resolveSignal({
        organizationId: buyerOrg,
        type: SignalType.ORDER_NEEDS_ACTION,
        sourceId: order,
      });

      expect(resolved).toBe(1);
      const [row] = await signalsOf(buyerOrg, SignalType.ORDER_NEEDS_ACTION);
      expect(row).toMatchObject({ status: 'dismissed', dismissedBy: 'system' });
      expect(row.dismissedAt).toBeInstanceOf(Date);
    });

    it('a new adjustment on the same order raises a fresh signal', async () => {
      await signals.createSignal({
        organizationId: buyerOrg,
        type: SignalType.ORDER_NEEDS_ACTION,
        sourceId: order,
        message:
          'Order #ORD-T7KA38 has an adjustment awaiting your confirmation.',
      });

      const rows = await signalsOf(buyerOrg, SignalType.ORDER_NEEDS_ACTION);
      expect(rows.map((row) => row.status)).toEqual(['dismissed', 'unread']);
    });

    it('an overdue job reporting the same invoice 3 days running leaves one urgent signal, resolved on payment', async () => {
      const input = {
        organizationId: supplierOrg,
        type: SignalType.INVOICE_OVERDUE,
        sourceId: invoice,
        message: 'Invoice #INV-1042 was due on 2026-09-01 and is overdue.',
      };
      await signals.createSignal(input);
      await signals.createSignal(input);
      await signals.createSignal(input);

      let rows = await signalsOf(supplierOrg, SignalType.INVOICE_OVERDUE);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        severity: 'urgent',
        sourceType: 'invoice',
      });

      await signals.resolveSignal(input);
      rows = await signalsOf(supplierOrg, SignalType.INVOICE_OVERDUE);
      expect(rows[0]).toMatchObject({
        status: 'dismissed',
        dismissedBy: 'system',
      });
    });
  });

  describe('Integrations → sync_error', () => {
    let connectionId: string;

    beforeAll(async () => {
      const saved = await dataSource.getRepository(ProviderConnection).save({
        organizationId: buyerOrg,
        provider: ProviderType.XERO,
        externalRealmId: `tenant-${run}`,
        status: ConnectionStatus.CONNECTED,
      });
      connectionId = saved.id;
    });

    it('connected → error raises one urgent signal pointing at the connection', async () => {
      await providerConnections.markError(connectionId, 'invalid_grant');
      await providerConnections.markError(connectionId, 'invalid_grant');

      const rows = await signalsOf(buyerOrg, SignalType.SYNC_ERROR);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        severity: 'urgent',
        sourceType: 'connection',
        sourceId: connectionId,
        title: 'Integration sync failed',
        message: 'Xero sync failed — reconnect required.',
        status: 'unread',
      });
    });

    it('reconnecting resolves it', async () => {
      await providerConnections.upsertTokens({
        organizationId: buyerOrg,
        provider: ProviderType.XERO,
        externalRealmId: `tenant-${run}`,
        accessToken: 'access',
        refreshToken: 'refresh',
        accessTokenExpiresAt: new Date(Date.now() + 60_000),
        refreshTokenExpiresAt: new Date(Date.now() + 120_000),
      });

      const [row] = await signalsOf(buyerOrg, SignalType.SYNC_ERROR);
      expect(row).toMatchObject({ status: 'dismissed', dismissedBy: 'system' });
    });
  });

  describe('BI detectors → finding signals', () => {
    let duplicateIds: string[];
    let missingSupplierIds: string[];
    let vendorId: string;

    const provenance = (key: string) => ({
      organizationId: buyerOrg,
      sourceSystem: SourceSystem.CSV,
      sourceExternalId: `${key}-${run}`,
    });

    async function addExpense(
      key: string,
      date: string,
      amount: string,
      vendor: string | null,
    ): Promise<string> {
      const saved = await dataSource.getRepository(ExpenseTransaction).save({
        ...provenance(key),
        transactionType: ExpenseTransactionType.BILL,
        vendorId: vendor,
        transactionDate: date,
        totalAmount: amount,
      });
      return saved.id;
    }

    beforeAll(async () => {
      const vendor = await dataSource.getRepository(Vendor).save({
        ...provenance('vendor'),
        displayName: 'ABC Supplies',
      });
      vendorId = vendor.id;
      const category = await dataSource.getRepository(SpendCategory).save({
        ...provenance('category'),
        name: 'Packaging',
      });

      // Same supplier + date + amount, twice.
      duplicateIds = [
        await addExpense('dup-1', '2026-08-10', '2150.00', vendorId),
        await addExpense('dup-2', '2026-08-10', '2150.00', vendorId),
      ];
      // Three September transactions with no supplier.
      missingSupplierIds = [
        await addExpense('nosup-1', '2026-09-03', '41.10', null),
        await addExpense('nosup-2', '2026-09-11', '52.20', null),
        await addExpense('nosup-3', '2026-09-19', '63.30', null),
      ];
      // Packaging: $8,000 in July → $11,000 in August on the same quantity.
      const july = await addExpense(
        'pack-jul',
        '2026-07-15',
        '8000.00',
        vendorId,
      );
      const august = await addExpense(
        'pack-aug',
        '2026-08-15',
        '11000.00',
        vendorId,
      );
      await dataSource.getRepository(ExpenseTransactionLine).save([
        {
          organizationId: buyerOrg,
          transactionId: july,
          externalLineId: '1',
          vendorId,
          categoryId: category.id,
          transactionDate: '2026-07-15',
          amount: '8000.00',
          quantity: '100',
        },
        {
          organizationId: buyerOrg,
          transactionId: august,
          externalLineId: '1',
          vendorId,
          categoryId: category.id,
          transactionDate: '2026-08-15',
          amount: '11000.00',
          quantity: '100',
        },
      ]);
    });

    it('a sync raises one signal per finding, worded from the detector’s numbers', async () => {
      await findingSignals.refreshForOrganization(buyerOrg, TODAY);

      const [cost] = await signalsOf(buyerOrg, SignalType.COST_INCREASE);
      const [duplicate] = await signalsOf(
        buyerOrg,
        SignalType.POSSIBLE_DUPLICATE,
      );
      const [quality] = await signalsOf(buyerOrg, SignalType.DATA_QUALITY);

      expect(cost).toMatchObject({
        severity: 'warning',
        sourceType: 'finding',
        title: 'Packaging costs increased',
        message: 'Packaging spend is up 37.5% with flat volume.',
      });
      expect(duplicate).toMatchObject({
        severity: 'warning',
        sourceType: 'finding',
        title: 'Possible duplicate bill',
        message: 'Possible duplicate bill from ABC Supplies for $2,150.00.',
      });
      expect(quality).toMatchObject({
        severity: 'info',
        sourceType: 'finding',
        title: 'Data quality issue',
        message: '3 transactions this month have no supplier assigned.',
      });
    });

    it('processing the same findings again creates no duplicates', async () => {
      await findingSignals.refreshForOrganization(buyerOrg, TODAY);
      await findingSignals.refreshForOrganization(buyerOrg, TODAY);

      for (const type of [
        SignalType.COST_INCREASE,
        SignalType.POSSIBLE_DUPLICATE,
        SignalType.DATA_QUALITY,
      ]) {
        expect(await signalsOf(buyerOrg, type)).toHaveLength(1);
      }
    });

    it('a finding the user dismissed is not raised again by the next sync', async () => {
      const [duplicate] = await signalsOf(
        buyerOrg,
        SignalType.POSSIBLE_DUPLICATE,
      );
      await buyer
        .patch(`/api/v1/signals/${duplicate.id}`)
        .send({ status: 'dismissed' })
        .expect(200);

      await findingSignals.refreshForOrganization(buyerOrg, TODAY);

      const rows = await signalsOf(buyerOrg, SignalType.POSSIBLE_DUPLICATE);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: 'dismissed',
        dismissedBy: 'user',
      });
    });

    it('a finding that is fixed at the source auto-resolves on the next sync', async () => {
      await dataSource
        .getRepository(ExpenseTransaction)
        .update(missingSupplierIds, { vendorId });

      await findingSignals.refreshForOrganization(buyerOrg, TODAY);

      const [quality] = await signalsOf(buyerOrg, SignalType.DATA_QUALITY);
      expect(quality).toMatchObject({
        status: 'dismissed',
        dismissedBy: 'system',
      });
      // The cost increase is still true, so its signal is untouched.
      const [cost] = await signalsOf(buyerOrg, SignalType.COST_INCREASE);
      expect(cost.status).toBe('unread');
      expect(duplicateIds).toHaveLength(2);
    });
  });

  describe('HTTP API', () => {
    const feed = async (
      agent: TestAgent,
      query: Record<string, unknown> = {},
    ) =>
      body<Feed>(await agent.get('/api/v1/signals').query(query).expect(200));

    it('requires a session', async () => {
      await request(app.getHttpServer()).get('/api/v1/signals').expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/signals/count')
        .expect(401);
    });

    it('returns only the caller’s organization’s signals, with no embedded source data', async () => {
      const buyerFeed = await feed(buyer, { limit: 100 });
      const supplierFeed = await feed(supplier, { limit: 100 });

      expect(buyerFeed.items.length).toBeGreaterThan(0);
      expect(
        buyerFeed.items.every((item) => item.organizationId === buyerOrg),
      ).toBe(true);
      expect(
        supplierFeed.items.every((item) => item.organizationId === supplierOrg),
      ).toBe(true);
      expect(Object.keys(buyerFeed.items[0]).sort()).toEqual([
        'createdAt',
        'dismissedAt',
        'dismissedBy',
        'id',
        'message',
        'organizationId',
        'readAt',
        'severity',
        'sourceId',
        'sourceType',
        'status',
        'title',
        'type',
        'updatedAt',
      ]);
    });

    it('filters by status, type and severity (comma-separated)', async () => {
      const dismissed = await feed(buyer, { status: 'dismissed' });
      expect(dismissed.items.length).toBeGreaterThan(0);
      expect(
        dismissed.items.every((i) => i.status === SignalStatus.DISMISSED),
      ).toBe(true);

      const attention = await feed(buyer, {
        status: 'unread,read',
        severity: 'warning,urgent',
      });
      expect(attention.items.length).toBeGreaterThan(0);
      expect(
        attention.items.every(
          (i) =>
            i.status !== SignalStatus.DISMISSED &&
            i.severity !== SignalSeverity.INFO,
        ),
      ).toBe(true);

      const byType = await feed(buyer, { type: 'cost_increase' });
      expect(byType.items.map((i) => i.type)).toEqual(['cost_increase']);
    });

    it('filters by creation date', async () => {
      const future = await feed(buyer, { from: '2999-01-01T00:00:00.000Z' });
      expect(future.items).toEqual([]);

      const past = await feed(buyer, { to: '2000-01-01T00:00:00.000Z' });
      expect(past.items).toEqual([]);
    });

    it('rejects invalid filters and cursors', async () => {
      await buyer
        .get('/api/v1/signals')
        .query({ status: 'archived' })
        .expect(400);
      await buyer.get('/api/v1/signals').query({ limit: 0 }).expect(400);
      await buyer.get('/api/v1/signals').query({ cursor: 'nope' }).expect(400);
      await buyer
        .get('/api/v1/signals')
        .query({ organizationId: supplierOrg })
        .expect(400);
    });

    it('pages through every signal exactly once, even when they share a timestamp', async () => {
      // Five more supplier signals, then force all of the org's rows onto one
      // created_at — the worst case for a (created_at, id) keyset.
      for (let n = 10; n < 15; n += 1) {
        await signals.createSignal({
          organizationId: supplierOrg,
          type: SignalType.ORDER_READY_TO_PACK,
          sourceId: uuid(n),
          message: `Order #ORD-${n} from Riverside Bistro is awaiting packing.`,
        });
      }
      await dataSource.query(
        `UPDATE signals SET created_at = '2026-09-30 10:00:00.123456+00' WHERE organization_id = $1`,
        [supplierOrg],
      );
      const total = await dataSource
        .getRepository(Signal)
        .count({ where: { organizationId: supplierOrg } });

      const seen: string[] = [];
      let cursor: string | null | undefined;
      let pages = 0;
      do {
        const page = await feed(supplier, {
          limit: 3,
          cursor: cursor ?? undefined,
        });
        expect(page.items.length).toBeLessThanOrEqual(3);
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor && pages < 20);

      expect(total).toBeGreaterThan(6);
      expect(seen).toHaveLength(total);
      expect(new Set(seen).size).toBe(total);
    });

    it('counts unread signals for the badge', async () => {
      const expected = await dataSource.getRepository(Signal).count({
        where: {
          organizationId: supplierOrg,
          status: SignalStatus.UNREAD,
        },
      });

      const res = await supplier.get('/api/v1/signals/count').expect(200);

      expect(body<{ unread: number }>(res)).toEqual({ unread: expected });
      expect(expected).toBeGreaterThan(0);
    });

    it('opening a signal marks it read; dismissing records dismissed_by = user', async () => {
      const { items } = await feed(supplier, { status: 'unread', limit: 1 });
      const [target] = items;
      const before = body<{ unread: number }>(
        await supplier.get('/api/v1/signals/count').expect(200),
      ).unread;

      const read = body<Signal>(
        await supplier
          .patch(`/api/v1/signals/${target.id}`)
          .send({ status: 'read' })
          .expect(200),
      );
      expect(read).toMatchObject({ status: 'read', dismissedBy: null });
      expect(read.readAt).toEqual(expect.any(String));

      const after = body<{ unread: number }>(
        await supplier.get('/api/v1/signals/count').expect(200),
      ).unread;
      expect(after).toBe(before - 1);

      const dismissed = body<Signal>(
        await supplier
          .patch(`/api/v1/signals/${target.id}`)
          .send({ status: 'dismissed' })
          .expect(200),
      );
      expect(dismissed).toMatchObject({
        status: 'dismissed',
        dismissedBy: 'user',
      });
      expect(dismissed.dismissedAt).toEqual(expect.any(String));

      // Dismissing twice is fine; un-dismissing by "reading" is not.
      await supplier
        .patch(`/api/v1/signals/${target.id}`)
        .send({ status: 'dismissed' })
        .expect(200);
      await supplier
        .patch(`/api/v1/signals/${target.id}`)
        .send({ status: 'read' })
        .expect(409);
    });

    it('never lets a user set unread, edit content, or touch another org’s signal', async () => {
      const { items } = await feed(supplier, { status: 'unread', limit: 1 });
      const [target] = items;

      await supplier
        .patch(`/api/v1/signals/${target.id}`)
        .send({ status: 'unread' })
        .expect(400);
      await supplier
        .patch(`/api/v1/signals/${target.id}`)
        .send({ status: 'read', message: 'edited' })
        .expect(400);
      await supplier
        .patch('/api/v1/signals/not-a-uuid')
        .send({ status: 'read' })
        .expect(400);

      // The buyer can see neither the row nor that it exists.
      await buyer
        .patch(`/api/v1/signals/${target.id}`)
        .send({ status: 'dismissed' })
        .expect(404);
      const untouched = await dataSource
        .getRepository(Signal)
        .findOneByOrFail({ id: target.id });
      expect(untouched.status).toBe('unread');
    });
  });
});
