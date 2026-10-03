import { Test, type TestingModule } from '@nestjs/testing';
import { SignalType } from '@modules/signals/entities';
import { SignalsService } from '@modules/signals/services';
import type { CreateSignalInput } from '@modules/signals/types';
import { MAX_DUPLICATE_SIGNALS } from '../constants';
import type { DuplicateGroupWithCurrency } from '../types';
import { CategoryPriceIncreaseScanService } from './category-price-increase-scan.service';
import { DataQualityService } from './data-quality.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { FindingSignalsService } from './finding-signals.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const TODAY = new Date('2026-09-30T12:00:00.000Z');

const group = (
  overrides: Partial<DuplicateGroupWithCurrency> = {},
): DuplicateGroupWithCurrency => ({
  vendorId: '33333333-3333-4333-8333-333333333333',
  vendorName: 'ABC Supplies',
  transactionDate: '2026-09-12',
  totalAmount: 2150,
  currency: 'USD',
  occurrences: 2,
  transactionIds: ['a', 'b'],
  ...overrides,
});

describe('FindingSignalsService', () => {
  let service: FindingSignalsService;
  let signals: { createSignal: jest.Mock; resolveStaleSignals: jest.Mock };
  let duplicates: { findGroupsForOrganization: jest.Mock };
  let dataQuality: { countMissingSupplier: jest.Mock };
  let priceIncreases: { findPriceIncreases: jest.Mock };

  beforeEach(async () => {
    signals = {
      createSignal: jest.fn().mockResolvedValue({}),
      resolveStaleSignals: jest.fn().mockResolvedValue(0),
    };
    duplicates = { findGroupsForOrganization: jest.fn().mockResolvedValue([]) };
    dataQuality = { countMissingSupplier: jest.fn().mockResolvedValue(0) };
    priceIncreases = { findPriceIncreases: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FindingSignalsService,
        { provide: SignalsService, useValue: signals },
        { provide: DuplicateDetectionService, useValue: duplicates },
        { provide: DataQualityService, useValue: dataQuality },
        {
          provide: CategoryPriceIncreaseScanService,
          useValue: priceIncreases,
        },
      ],
    }).compile();
    service = module.get(FindingSignalsService);
  });

  const created = (type: SignalType) =>
    (
      signals.createSignal.mock.calls as [
        [CreateSignalInput, { skipIfUserDismissed: boolean }],
      ]
    )
      .filter(([input]) => input.type === type)
      .map(([input]) => input);

  const staleCall = (type: SignalType) =>
    (
      signals.resolveStaleSignals.mock.calls as [
        [{ type: SignalType; activeSourceIds: string[] }],
      ]
    ).find(([input]) => input.type === type)![0];

  it('raises a cost_increase signal from the detector’s own numbers', async () => {
    priceIncreases.findPriceIncreases.mockResolvedValue([
      {
        categoryId: '44444444-4444-4444-8444-444444444444',
        categoryName: 'Packaging',
        spendChangePercent: 37.5,
      },
    ]);

    await service.refreshForOrganization(ORG, TODAY);

    // Last full month vs the one before — never the half-finished current month.
    expect(priceIncreases.findPriceIncreases).toHaveBeenCalledWith(ORG, {
      currentFrom: '2026-08-01',
      currentTo: '2026-08-31',
      priorFrom: '2026-07-01',
      priorTo: '2026-07-31',
    });
    expect(created(SignalType.COST_INCREASE)).toEqual([
      expect.objectContaining({
        organizationId: ORG,
        title: 'Packaging costs increased',
        message: 'Packaging spend is up 37.5% with flat volume.',
      }),
    ]);
  });

  it('raises one possible_duplicate signal per group, quoting the group’s amount', async () => {
    duplicates.findGroupsForOrganization.mockResolvedValue([
      group(),
      group({ vendorId: null, vendorName: null, totalAmount: 99.5 }),
    ]);

    await service.refreshForOrganization(ORG, TODAY);

    expect(
      created(SignalType.POSSIBLE_DUPLICATE).map((c) => c.message),
    ).toEqual([
      'Possible duplicate bill from ABC Supplies for $2,150.00.',
      'Possible duplicate bill from an unknown supplier for $99.50.',
    ]);
  });

  it('raises a data_quality signal with this month’s missing-supplier count', async () => {
    dataQuality.countMissingSupplier.mockResolvedValue(3);

    await service.refreshForOrganization(ORG, TODAY);

    expect(dataQuality.countMissingSupplier).toHaveBeenCalledWith(
      ORG,
      '2026-09-01',
      '2026-09-30',
    );
    expect(created(SignalType.DATA_QUALITY).map((c) => c.message)).toEqual([
      '3 transactions this month have no supplier assigned.',
    ]);
  });

  it('gives the same finding the same source id on every run, so it dedupes', async () => {
    duplicates.findGroupsForOrganization.mockResolvedValue([group()]);

    await service.refreshForOrganization(ORG, TODAY);
    await service.refreshForOrganization(ORG, TODAY);

    const [first, second] = created(SignalType.POSSIBLE_DUPLICATE);
    expect(first.sourceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second.sourceId).toBe(first.sourceId);
  });

  it('never resurrects a finding the user dismissed', async () => {
    duplicates.findGroupsForOrganization.mockResolvedValue([group()]);

    await service.refreshForOrganization(ORG, TODAY);

    for (const [, options] of signals.createSignal.mock.calls as [
      [unknown, { skipIfUserDismissed: boolean }],
    ]) {
      expect(options).toEqual({ skipIfUserDismissed: true });
    }
  });

  it('resolves signals whose finding is gone', async () => {
    duplicates.findGroupsForOrganization.mockResolvedValue([group()]);

    await service.refreshForOrganization(ORG, TODAY);

    const [duplicateSignal] = created(SignalType.POSSIBLE_DUPLICATE);
    expect(staleCall(SignalType.POSSIBLE_DUPLICATE).activeSourceIds).toEqual([
      duplicateSignal.sourceId,
    ]);
    // Nothing detected → every active signal of that type is stale.
    expect(staleCall(SignalType.DATA_QUALITY).activeSourceIds).toEqual([]);
    expect(staleCall(SignalType.COST_INCREASE).activeSourceIds).toEqual([]);
  });

  it('caps new duplicate signals but still protects every detected group from being resolved', async () => {
    const groups = Array.from({ length: MAX_DUPLICATE_SIGNALS + 5 }, (_, i) =>
      group({ totalAmount: 100 + i }),
    );
    duplicates.findGroupsForOrganization.mockResolvedValue(groups);

    await service.refreshForOrganization(ORG, TODAY);

    expect(created(SignalType.POSSIBLE_DUPLICATE)).toHaveLength(
      MAX_DUPLICATE_SIGNALS,
    );
    expect(
      staleCall(SignalType.POSSIBLE_DUPLICATE).activeSourceIds,
    ).toHaveLength(groups.length);
  });

  it('a failing detector neither throws nor resolves its signals, and the others still run', async () => {
    duplicates.findGroupsForOrganization.mockRejectedValue(
      new Error('query timeout'),
    );
    dataQuality.countMissingSupplier.mockResolvedValue(1);

    await expect(
      service.refreshForOrganization(ORG, TODAY),
    ).resolves.toBeUndefined();

    expect(
      (signals.resolveStaleSignals.mock.calls as [[{ type: SignalType }]]).map(
        ([input]) => input.type,
      ),
    ).toEqual([SignalType.COST_INCREASE, SignalType.DATA_QUALITY]);
    expect(created(SignalType.DATA_QUALITY).map((c) => c.message)).toEqual([
      '1 transaction this month has no supplier assigned.',
    ]);
  });
});
