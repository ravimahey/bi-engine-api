import { buildFindingId } from './finding-id.util';
import {
  currentMonthWindow,
  lastFullMonthWindows,
} from './finding-periods.util';

describe('buildFindingId', () => {
  it('is deterministic and a valid RFC 4122 v5 uuid', () => {
    const id = buildFindingId('org', 'possible_duplicate', 'vendor', '2150.00');

    expect(id).toBe(
      buildFindingId('org', 'possible_duplicate', 'vendor', '2150.00'),
    );
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('differs when any part of the finding’s identity differs', () => {
    const ids = new Set([
      buildFindingId('org-a', 'cost_increase', 'category', '2026-08-01'),
      buildFindingId('org-b', 'cost_increase', 'category', '2026-08-01'),
      buildFindingId('org-a', 'data_quality', 'category', '2026-08-01'),
      buildFindingId('org-a', 'cost_increase', 'category', '2026-09-01'),
    ]);

    expect(ids.size).toBe(4);
  });
});

describe('finding periods', () => {
  it('compares the last full month with the month before it', () => {
    expect(lastFullMonthWindows(new Date('2026-09-30T12:00:00Z'))).toEqual({
      currentFrom: '2026-08-01',
      currentTo: '2026-08-31',
      priorFrom: '2026-07-01',
      priorTo: '2026-07-31',
    });
  });

  it('rolls back across a year boundary and handles February', () => {
    expect(lastFullMonthWindows(new Date('2028-01-15T00:00:00Z'))).toEqual({
      currentFrom: '2027-12-01',
      currentTo: '2027-12-31',
      priorFrom: '2027-11-01',
      priorTo: '2027-11-30',
    });
    expect(lastFullMonthWindows(new Date('2028-03-01T00:00:00Z'))).toEqual({
      currentFrom: '2028-02-01',
      currentTo: '2028-02-29',
      priorFrom: '2028-01-01',
      priorTo: '2028-01-31',
    });
  });

  it('spans the whole calendar month today falls in', () => {
    expect(currentMonthWindow(new Date('2026-09-30T23:59:59Z'))).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
  });
});
