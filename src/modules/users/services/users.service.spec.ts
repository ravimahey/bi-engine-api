import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Repository } from 'typeorm';
import { SortOrder } from '@common/dto';
import { QueryUsersDto } from '../dto';
import { User, UserRole } from '../entities';
import { PasswordService } from './password.service';
import { UsersService } from './users.service';

type MockRepo = Partial<Record<keyof Repository<User>, jest.Mock>>;

const createMockRepo = (): MockRepo => ({
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  exists: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let repo: MockRepo;

  beforeEach(async () => {
    repo = createMockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        PasswordService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('create', () => {
    const dto = {
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      password: 'Str0ng!Pass',
      role: UserRole.OWNER,
    };

    it('hashes the password instead of storing it in plain text', async () => {
      repo.findOne!.mockResolvedValue(null);
      repo.create!.mockImplementation((v: Partial<User>) => v);
      repo.save!.mockImplementation((v: User) =>
        Promise.resolve({ ...v, id: 'uuid' }),
      );

      await service.create(dto);

      const [[saved]] = repo.create!.mock.calls as [[Partial<User>]];
      expect(saved.passwordHash).toBeDefined();
      expect(saved.passwordHash).not.toContain(dto.password);
      expect(saved).not.toHaveProperty('password');
    });

    it('rejects an email that is already taken', async () => {
      repo.findOne!.mockResolvedValue({ id: 'existing' });

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('translates paging into skip/take and returns pagination meta', async () => {
      repo.findAndCount!.mockResolvedValue([[], 45]);

      const query = Object.assign(new QueryUsersDto(), {
        page: 3,
        limit: 10,
        sortBy: 'createdAt' as const,
        order: SortOrder.DESC,
      });

      const result = await service.findAll(query);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
          order: { createdAt: SortOrder.DESC },
        }),
      );
      expect(result.meta).toEqual({
        total: 45,
        page: 3,
        limit: 10,
        totalPages: 5,
        hasPreviousPage: true,
        hasNextPage: true,
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for an unknown id', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes and throws when nothing matched', async () => {
      repo.softDelete!.mockResolvedValue({ affected: 0 });

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
