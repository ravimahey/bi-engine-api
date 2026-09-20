import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpendCategory, Vendor } from '@modules/records/entities';

/**
 * Resolves the human label (category / supplier name) the explanation is
 * written about. Scoped by `organizationId` so an id from another tenant
 * looks exactly like a missing one — the caller's access to that
 * organization is already enforced upstream by the analytics service.
 */
@Injectable()
export class SubjectNameService {
  constructor(
    @InjectRepository(SpendCategory)
    private readonly categories: Repository<SpendCategory>,
    @InjectRepository(Vendor)
    private readonly vendors: Repository<Vendor>,
  ) {}

  async getCategoryName(
    organizationId: string,
    categoryId: string,
  ): Promise<string> {
    const category = await this.categories.findOne({
      where: { id: categoryId, organizationId },
      select: { id: true, name: true },
    });
    if (!category) throw new NotFoundException('Category does not exist');
    return category.name;
  }

  async getVendorName(
    organizationId: string,
    vendorId: string,
  ): Promise<string> {
    const vendor = await this.vendors.findOne({
      where: { id: vendorId, organizationId },
      select: { id: true, displayName: true },
    });
    if (!vendor) throw new NotFoundException('Supplier does not exist');
    return vendor.displayName;
  }
}
