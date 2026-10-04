import { BadRequestException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import type { AuthenticatedUser } from '@common/decorators';
import { AuthTokenService } from '@modules/auth/services';
import { UserRole } from '@modules/users/entities';
import { UsersService } from '@modules/users/services';
import type { CreateOrganizationDto } from '../dto';
import { Organization } from '../entities';
import { OrganizationProfileService } from './organization-profile.service';
import { OrganizationSlugService } from './organization-slug.service';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService.create', () => {
  let service: OrganizationsService;
  const repo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value: Partial<Organization>) => value),
    save: jest.fn((value: Partial<Organization>) =>
      Promise.resolve({ ...value, id: 'org-1' }),
    ),
  };
  const usersService = {
    findOne: jest.fn().mockResolvedValue({ organizationId: null }),
    linkOrganization: jest.fn().mockResolvedValue({ id: 'user-1' }),
  };
  const authTokenService = {
    startSession: jest.fn().mockResolvedValue({ tokens: { access: 't' } }),
  };
  const buyer = { id: 'user-1', role: UserRole.BUYER } as AuthenticatedUser;

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.find.mockResolvedValue([]);
    repo.findOne.mockResolvedValue(null);
    const module = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        OrganizationProfileService,
        OrganizationSlugService,
        { provide: getRepositoryToken(Organization), useValue: repo },
        { provide: UsersService, useValue: usersService },
        { provide: AuthTokenService, useValue: authTokenService },
      ],
    }).compile();
    service = module.get(OrganizationsService);
  });

  const profile: CreateOrganizationDto = {
    name: 'Green Chili',
    country: 'AU',
    region: 'VIC',
    streetAddress: '12 Collins St',
    city: 'Melbourne',
    postcode: '3000',
    timezone: 'Australia/Sydney',
    businessTypes: ['restaurant'],
  };

  it('generates a unique slug from the name when none is sent', async () => {
    repo.find.mockResolvedValue([{ slug: 'green-chili' }]);

    const { organization } = await service.create(profile, buyer);

    expect(organization.slug).toBe('green-chili-2');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        postcode: '3000',
        businessTypes: ['restaurant'],
      }),
    );
  });

  it('still rejects an explicit slug that is already taken', async () => {
    repo.findOne.mockResolvedValue({ id: 'other' });

    await expect(
      service.create({ ...profile, slug: 'green-chili' }, buyer),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an inconsistent profile before writing anything', async () => {
    await expect(
      service.create({ ...profile, postcode: '411001' }, buyer),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
