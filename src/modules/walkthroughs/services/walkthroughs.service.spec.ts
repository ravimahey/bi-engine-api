import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Repository } from 'typeorm';
import { UserWalkthrough, WalkthroughStatus } from '../entities';
import { WalkthroughsService } from './walkthroughs.service';

type MockRepo = Partial<Record<keyof Repository<UserWalkthrough>, jest.Mock>>;

describe('WalkthroughsService', () => {
  let service: WalkthroughsService;
  let repo: MockRepo;

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      upsert: jest.fn(),
      findOneOrFail: jest.fn(),
      delete: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalkthroughsService,
        { provide: getRepositoryToken(UserWalkthrough), useValue: repo },
      ],
    }).compile();
    service = module.get(WalkthroughsService);
  });

  it('only lists the caller’s own rows', async () => {
    repo.find!.mockResolvedValue([]);
    await service.listForUser('user-1');
    const [[options]] = repo.find!.mock.calls as [[{ where: unknown }]];
    expect(options.where).toEqual({ userId: 'user-1' });
  });

  it('upserts on (userId, tourKey) and clears completedAt while in progress', async () => {
    repo.findOneOrFail!.mockResolvedValue({ id: 'row' });
    await service.upsert('user-1', 'onboarding:buyer', {
      status: WalkthroughStatus.IN_PROGRESS,
      currentStep: 3,
    });
    const [[values, options]] = repo.upsert!.mock.calls as [
      [Partial<UserWalkthrough>, { conflictPaths: string[] }],
    ];
    expect(values).toMatchObject({
      userId: 'user-1',
      tourKey: 'onboarding:buyer',
      currentStep: 3,
      completedAt: null,
    });
    expect(options.conflictPaths).toEqual(['userId', 'tourKey']);
  });

  it('stamps completedAt when a tour is completed or skipped', async () => {
    repo.findOneOrFail!.mockResolvedValue({ id: 'row' });
    await service.upsert('user-1', 'page:insights-overview', {
      status: WalkthroughStatus.SKIPPED,
    });
    const [[values]] = repo.upsert!.mock.calls as [[Partial<UserWalkthrough>]];
    expect(values.completedAt).toBeInstanceOf(Date);
    expect(values.currentStep).toBe(0);
  });

  it('reset deletes only the caller’s rows', async () => {
    await service.resetForUser('user-1');
    expect(repo.delete).toHaveBeenCalledWith({ userId: 'user-1' });
  });
});
