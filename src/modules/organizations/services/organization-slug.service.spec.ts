import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Organization } from '../entities';
import { OrganizationSlugService } from './organization-slug.service';

describe('OrganizationSlugService', () => {
  let service: OrganizationSlugService;
  const find = jest.fn();

  const takenSlugs = (...slugs: string[]) =>
    find.mockResolvedValue(slugs.map((slug) => ({ slug })));

  beforeEach(async () => {
    find.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        OrganizationSlugService,
        { provide: getRepositoryToken(Organization), useValue: { find } },
      ],
    }).compile();
    service = module.get(OrganizationSlugService);
  });

  describe('slugify', () => {
    it('lowercases and hyphenates a display name', () => {
      expect(service.slugify('  Green Chili & Co.  ')).toBe('green-chili-co');
    });

    it('falls back when nothing usable is left', () => {
      expect(service.slugify('!!!')).toBe('organization');
    });

    it('caps the base length without leaving a trailing hyphen', () => {
      const slug = service.slugify(`${'a'.repeat(239)} b`);
      expect(slug.length).toBeLessThanOrEqual(240);
      expect(slug.endsWith('-')).toBe(false);
    });
  });

  describe('generateUnique', () => {
    it('uses the plain slug when it is free', async () => {
      takenSlugs();
      await expect(service.generateUnique('Green Chili')).resolves.toBe(
        'green-chili',
      );
    });

    it('appends the next free numeric suffix when taken', async () => {
      takenSlugs('green-chili', 'green-chili-2');
      await expect(service.generateUnique('Green Chili')).resolves.toBe(
        'green-chili-3',
      );
    });

    it('fills a gap in the suffix sequence', async () => {
      takenSlugs('green-chili', 'green-chili-3');
      await expect(service.generateUnique('Green Chili')).resolves.toBe(
        'green-chili-2',
      );
    });

    it('counts soft-deleted organizations as taken', async () => {
      takenSlugs();
      await service.generateUnique('Green Chili');
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
    });
  });
});
