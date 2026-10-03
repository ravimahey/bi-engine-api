import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, type TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '@common/decorators';
import { QuerySignalsDto } from '../dto';
import {
  Signal,
  SignalDismissedBy,
  SignalSeverity,
  SignalStatus,
  SignalType,
} from '../entities';
import { decodeSignalCursor } from '../utils';
import { SignalsFeedService } from './signals-feed.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const user: AuthenticatedUser = {
  id: 'user-1',
  email: 'ada@example.com',
  role: 'buyer',
  organizationId: ORG,
};
const orphan: AuthenticatedUser = { ...user, organizationId: null };

const signalId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const timestamp = (n: number) =>
  `2026-09-30T10:00:00.${String(n).padStart(6, '0')}Z`;

function createListBuilder(rowCount: number) {
  const entities = Array.from({ length: rowCount }, (_, i) => ({
    id: signalId(i),
  }));
  const raw = entities.map((_, i) => ({ cursor_created_at: timestamp(i) }));
  return {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawAndEntities: jest.fn().mockResolvedValue({ entities, raw }),
  };
}

describe('SignalsFeedService', () => {
  let service: SignalsFeedService;
  let repo: {
    createQueryBuilder: jest.Mock;
    count: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      createQueryBuilder: jest.fn(),
      count: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignalsFeedService,
        { provide: getRepositoryToken(Signal), useValue: repo },
      ],
    }).compile();
    service = module.get(SignalsFeedService);
  });

  const query = (overrides: Partial<QuerySignalsDto> = {}) =>
    Object.assign(new QuerySignalsDto(), { limit: 2, ...overrides });

  describe('list', () => {
    it('always scopes to the caller’s own organization', async () => {
      const builder = createListBuilder(0);
      repo.createQueryBuilder.mockReturnValue(builder);

      await service.list(user, query());

      expect(builder.where).toHaveBeenCalledWith(
        'signal.organizationId = :organizationId',
        { organizationId: ORG },
      );
    });

    it('applies each filter that was passed and none that were not', async () => {
      const builder = createListBuilder(0);
      repo.createQueryBuilder.mockReturnValue(builder);

      await service.list(
        user,
        query({
          status: [SignalStatus.UNREAD, SignalStatus.READ],
          severity: [SignalSeverity.URGENT],
          from: '2026-09-01T00:00:00.000Z',
        }),
      );

      const clauses = (builder.andWhere.mock.calls as [string][]).map(
        ([clause]) => clause,
      );
      expect(clauses).toEqual([
        'signal.status IN (:...statuses)',
        'signal.severity IN (:...severities)',
        'signal.createdAt >= :from',
      ]);
    });

    it('returns a cursor pointing at the last row when more rows exist', async () => {
      const builder = createListBuilder(3); // limit 2 + the look-ahead row
      repo.createQueryBuilder.mockReturnValue(builder);

      const page = await service.list(user, query());

      expect(builder.limit).toHaveBeenCalledWith(3);
      expect(page.items).toHaveLength(2);
      expect(decodeSignalCursor(page.nextCursor!)).toEqual({
        createdAt: timestamp(1),
        id: signalId(1),
      });
    });

    it('returns a null cursor on the last page', async () => {
      repo.createQueryBuilder.mockReturnValue(createListBuilder(2));

      const page = await service.list(user, query());

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });

    it('rejects a malformed cursor', async () => {
      repo.createQueryBuilder.mockReturnValue(createListBuilder(0));

      await expect(
        service.list(user, query({ cursor: 'not-a-cursor' })),
      ).rejects.toThrow('cursor is not a valid signals cursor');
    });
  });

  describe('countUnread', () => {
    it('counts only unread signals of the caller’s organization', async () => {
      repo.count.mockResolvedValue(4);

      await expect(service.countUnread(user)).resolves.toEqual({ unread: 4 });
      expect(repo.count).toHaveBeenCalledWith({
        where: { organizationId: ORG, status: SignalStatus.UNREAD },
      });
    });
  });

  describe('updateStatus', () => {
    const stored = (status: SignalStatus) =>
      ({ id: signalId(1), status, type: SignalType.SYNC_ERROR }) as Signal;

    it('marks an unread signal read and stamps readAt', async () => {
      repo.findOne.mockResolvedValue(stored(SignalStatus.UNREAD));

      await service.updateStatus(user, signalId(1), SignalStatus.READ);

      const [[where, changes]] = repo.update.mock.calls as [
        [Partial<Signal>, Partial<Signal>],
      ];
      expect(where).toMatchObject({ id: signalId(1), organizationId: ORG });
      expect(changes.status).toBe(SignalStatus.READ);
      expect(changes.readAt).toBeInstanceOf(Date);
    });

    it('records a user dismissal as dismissed_by = user', async () => {
      repo.findOne.mockResolvedValue(stored(SignalStatus.READ));

      await service.updateStatus(user, signalId(1), SignalStatus.DISMISSED);

      const [[, changes]] = repo.update.mock.calls as [
        [unknown, Partial<Signal>],
      ];
      expect(changes).toMatchObject({
        status: SignalStatus.DISMISSED,
        dismissedBy: SignalDismissedBy.USER,
      });
      expect(changes.dismissedAt).toBeInstanceOf(Date);
    });

    it('is a no-op when the signal is already in the requested status', async () => {
      repo.findOne.mockResolvedValue(stored(SignalStatus.DISMISSED));

      await service.updateStatus(user, signalId(1), SignalStatus.DISMISSED);

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('refuses to mark a dismissed signal read', async () => {
      repo.findOne.mockResolvedValue(stored(SignalStatus.DISMISSED));

      await expect(
        service.updateStatus(user, signalId(1), SignalStatus.READ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('reports another organization’s signal as not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus(user, signalId(1), SignalStatus.READ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: signalId(1), organizationId: ORG },
      });
    });
  });

  it('refuses every operation for a caller with no organization', async () => {
    await expect(service.list(orphan, query())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.countUnread(orphan)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.updateStatus(orphan, signalId(1), SignalStatus.READ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
