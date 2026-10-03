import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, type TestingModule } from '@nestjs/testing';
import type { FindOperator } from 'typeorm';
import { SIGNAL_TYPES } from '../constants';
import {
  Signal,
  SignalDismissedBy,
  SignalSeverity,
  SignalSourceType,
  SignalStatus,
  SignalType,
} from '../entities';
import { SignalsService } from './signals.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const SOURCE = '22222222-2222-4222-8222-222222222222';

/** The chained insert builder `createSignal` drives, with the inserted values captured. */
function createInsertBuilder(insertedRows: unknown[]) {
  const builder = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ raw: insertedRows }),
  };
  return builder;
}

describe('SignalsService', () => {
  let service: SignalsService;
  let builder: ReturnType<typeof createInsertBuilder>;
  let repo: {
    createQueryBuilder: jest.Mock;
    exists: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    builder = createInsertBuilder([{ id: 'new' }]);
    repo = {
      createQueryBuilder: jest.fn(() => builder),
      exists: jest.fn().mockResolvedValue(false),
      findOne: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignalsService,
        { provide: getRepositoryToken(Signal), useValue: repo },
      ],
    }).compile();
    service = module.get(SignalsService);
  });

  describe('registry', () => {
    it('defines exactly the 8 v0 types with the agreed severity and source', () => {
      expect(
        Object.fromEntries(
          Object.entries(SIGNAL_TYPES).map(([type, def]) => [
            type,
            [def.severity, def.sourceType],
          ]),
        ),
      ).toEqual({
        order_needs_action: ['warning', 'order'],
        order_ready_to_pack: ['info', 'order'],
        adjustment_rejected: ['warning', 'order'],
        cost_increase: ['warning', 'finding'],
        possible_duplicate: ['warning', 'finding'],
        data_quality: ['info', 'finding'],
        invoice_overdue: ['urgent', 'invoice'],
        sync_error: ['urgent', 'connection'],
      });
    });
  });

  describe('createSignal', () => {
    it('takes severity, source type and title from the registry, not the caller', async () => {
      await service.createSignal({
        organizationId: ORG,
        type: SignalType.INVOICE_OVERDUE,
        sourceId: SOURCE,
        message: ' Invoice #INV-1 was due on 2026-09-01 and is overdue. ',
      });

      expect(builder.values).toHaveBeenCalledWith({
        organizationId: ORG,
        type: SignalType.INVOICE_OVERDUE,
        sourceType: SignalSourceType.INVOICE,
        sourceId: SOURCE,
        severity: SignalSeverity.URGENT,
        title: 'Invoice overdue',
        message: 'Invoice #INV-1 was due on 2026-09-01 and is overdue.',
      });
    });

    it('lets the producer override the title', async () => {
      await service.createSignal({
        organizationId: ORG,
        type: SignalType.COST_INCREASE,
        sourceId: SOURCE,
        title: 'Packaging costs increased',
        message: 'Packaging spend is up 37.5% with flat volume.',
      });

      const [[values]] = builder.values.mock.calls as [[Partial<Signal>]];
      expect(values.title).toBe('Packaging costs increased');
    });

    it('inserts with ON CONFLICT DO NOTHING and returns the active signal either way', async () => {
      builder.execute.mockResolvedValue({ raw: [] }); // conflict: nothing inserted
      const existing = { id: 'existing' };
      repo.findOne.mockResolvedValue(existing);

      const result = await service.createSignal({
        organizationId: ORG,
        type: SignalType.SYNC_ERROR,
        sourceId: SOURCE,
        message: 'QuickBooks sync failed — reconnect required.',
      });

      expect(builder.orIgnore).toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it('skips a source the user already dismissed when asked to', async () => {
      repo.exists.mockResolvedValue(true);

      const result = await service.createSignal(
        {
          organizationId: ORG,
          type: SignalType.POSSIBLE_DUPLICATE,
          sourceId: SOURCE,
          message: 'Possible duplicate bill from ABC Supplies for $2,150.00.',
        },
        { skipIfUserDismissed: true },
      );

      expect(result).toBeNull();
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      const [[options]] = repo.exists.mock.calls as [
        [{ where: Partial<Signal> }],
      ];
      expect(options.where).toMatchObject({
        status: SignalStatus.DISMISSED,
        dismissedBy: SignalDismissedBy.USER,
      });
    });

    it('does not check past dismissals by default', async () => {
      await service.createSignal({
        organizationId: ORG,
        type: SignalType.ORDER_NEEDS_ACTION,
        sourceId: SOURCE,
        message: 'Order #ORD-1 has an adjustment awaiting your confirmation.',
      });

      expect(repo.exists).not.toHaveBeenCalled();
    });

    it('rejects an unknown type or an empty message', async () => {
      await expect(
        service.createSignal({
          organizationId: ORG,
          type: 'reorder_reminder' as SignalType,
          sourceId: SOURCE,
          message: 'x',
        }),
      ).rejects.toThrow('Unknown signal type');

      await expect(
        service.createSignal({
          organizationId: ORG,
          type: SignalType.SYNC_ERROR,
          sourceId: SOURCE,
          message: '   ',
        }),
      ).rejects.toThrow('needs a message');
    });
  });

  describe('resolveSignal', () => {
    it('system-dismisses only the active signal for the key', async () => {
      const resolved = await service.resolveSignal({
        organizationId: ORG,
        type: SignalType.ORDER_NEEDS_ACTION,
        sourceId: SOURCE,
      });

      expect(resolved).toBe(1);
      const [[where, changes]] = repo.update.mock.calls as [
        [Partial<Signal> & { status: FindOperator<SignalStatus> }, Signal],
      ];
      expect(where).toMatchObject({
        organizationId: ORG,
        type: SignalType.ORDER_NEEDS_ACTION,
        sourceType: SignalSourceType.ORDER,
        sourceId: SOURCE,
      });
      expect(where.status.value).toEqual([
        SignalStatus.UNREAD,
        SignalStatus.READ,
      ]);
      expect(changes).toMatchObject({
        status: SignalStatus.DISMISSED,
        dismissedBy: SignalDismissedBy.SYSTEM,
      });
      expect(changes.dismissedAt).toBeInstanceOf(Date);
    });
  });

  describe('resolveStaleSignals', () => {
    it('resolves every active signal of the type whose source is no longer reported', async () => {
      await service.resolveStaleSignals({
        organizationId: ORG,
        type: SignalType.POSSIBLE_DUPLICATE,
        activeSourceIds: [SOURCE],
      });

      const [[where]] = repo.update.mock.calls as [
        [{ sourceId: FindOperator<string> }],
      ];
      expect(where.sourceId.type).toBe('not');
      expect(where.sourceId.child?.type).toBe('in');
      expect(where.sourceId.value).toEqual([SOURCE]);
    });

    it('resolves all of them when nothing is reported any more', async () => {
      await service.resolveStaleSignals({
        organizationId: ORG,
        type: SignalType.DATA_QUALITY,
        activeSourceIds: [],
      });

      const [[where]] = repo.update.mock.calls as [[Record<string, unknown>]];
      expect(where).not.toHaveProperty('sourceId');
      expect(where).toMatchObject({
        organizationId: ORG,
        type: SignalType.DATA_QUALITY,
        sourceType: SignalSourceType.FINDING,
      });
    });
  });
});
