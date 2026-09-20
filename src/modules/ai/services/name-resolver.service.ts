import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { SpendCategory, Vendor } from '@modules/records/entities';
import type { NameMatch } from '../types';

const MAX_CANDIDATES = 5;

/** Escapes LIKE wildcards so a spoken name is matched literally. */
const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * Turns a name the owner said ("packaging", "ABC") into one canonical row
 * id, scoped to one organization - the reverse of `SubjectNameService`.
 * Ask Ordaraa tools take names, not ids, so the model never handles (or
 * guesses) an identifier. An exact case-insensitive match wins; otherwise a
 * single partial match is used; several partial matches come back as
 * `ambiguous` for the model to ask about.
 */
@Injectable()
export class NameResolverService {
  constructor(
    @InjectRepository(SpendCategory)
    private readonly categories: Repository<SpendCategory>,
    @InjectRepository(Vendor)
    private readonly vendors: Repository<Vendor>,
  ) {}

  async resolveCategory(
    organizationId: string,
    name: string,
  ): Promise<NameMatch> {
    const rows = await this.categories.find({
      where: { organizationId, name: ILike(`%${escapeLike(name)}%`) },
      select: { id: true, name: true },
      order: { name: 'ASC' },
      take: MAX_CANDIDATES + 1,
    });
    return this.pick(
      name,
      rows.map((r) => ({ id: r.id, name: r.name })),
    );
  }

  async resolveVendor(
    organizationId: string,
    name: string,
  ): Promise<NameMatch> {
    const rows = await this.vendors.find({
      where: { organizationId, displayName: ILike(`%${escapeLike(name)}%`) },
      select: { id: true, displayName: true },
      order: { displayName: 'ASC' },
      take: MAX_CANDIDATES + 1,
    });
    return this.pick(
      name,
      rows.map((r) => ({ id: r.id, name: r.displayName })),
    );
  }

  private pick(query: string, rows: { id: string; name: string }[]): NameMatch {
    const exact = rows.find(
      (r) => r.name.toLowerCase() === query.trim().toLowerCase(),
    );
    const match = exact ?? (rows.length === 1 ? rows[0] : undefined);

    if (match) return { status: 'found', id: match.id, name: match.name };
    if (rows.length === 0) return { status: 'not_found' };
    return {
      status: 'ambiguous',
      candidates: rows.slice(0, MAX_CANDIDATES).map((r) => r.name),
    };
  }
}
