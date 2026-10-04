import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { FALLBACK_SLUG } from '../constants';
import { Organization } from '../entities';

/** Leaves room for a "-N" suffix inside the 255-char `slug` column. */
const MAX_BASE_LENGTH = 240;

/**
 * Generates URL slugs for organizations whose creator didn't pick one —
 * the onboarding wizard only asks for a name. A name that's already taken
 * gets the next free numeric suffix ("green-chili", "green-chili-2", ...)
 * instead of a 409, so two businesses can share a display name.
 */
@Injectable()
export class OrganizationSlugService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
  ) {}

  slugify(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, MAX_BASE_LENGTH)
      .replace(/^-+|-+$/g, '');
    return slug || FALLBACK_SLUG;
  }

  async generateUnique(name: string): Promise<string> {
    const base = this.slugify(name);

    // Soft-deleted rows still hold their slug in the unique index, so they
    // count as taken. The pattern is safe: slugs never contain `%` or `_`.
    const taken = await this.organizationsRepository.find({
      select: { slug: true },
      where: [{ slug: base }, { slug: Like(`${base}-%`) }],
      withDeleted: true,
    });
    const used = new Set(taken.map((organization) => organization.slug));

    if (!used.has(base)) return base;
    let suffix = 2;
    while (used.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  }
}
