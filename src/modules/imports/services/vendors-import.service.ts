import { Injectable } from '@nestjs/common';
import { Vendor } from '@modules/records/entities';
import { RecordsBulkService } from '@modules/records/services';
import { vendorKey } from '../utils';
import { ImportLookupService } from './import-lookup.service';
import { PartyImportBase } from './party-import.base';

/** Step 1 — Vendors file → canonical `Vendor` rows (source CSV). */
@Injectable()
export class VendorsImportService extends PartyImportBase {
  protected readonly entity = Vendor;
  protected readonly nameHeader = 'Vendor Name';

  constructor(lookup: ImportLookupService, bulk: RecordsBulkService) {
    super(lookup, bulk);
  }

  protected keyOf(name: string): string {
    return vendorKey(name);
  }
}
