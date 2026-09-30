import { Injectable } from '@nestjs/common';
import { Customer } from '@modules/records/entities';
import { RecordsBulkService } from '@modules/records/services';
import { customerKey } from '../utils';
import { ImportLookupService } from './import-lookup.service';
import { PartyImportBase } from './party-import.base';

/** Step 2 — Customers file → canonical `Customer` rows (source CSV). */
@Injectable()
export class CustomersImportService extends PartyImportBase {
  protected readonly entity = Customer;
  protected readonly nameHeader = 'Customer Name';

  constructor(lookup: ImportLookupService, bulk: RecordsBulkService) {
    super(lookup, bulk);
  }

  protected keyOf(name: string): string {
    return customerKey(name);
  }
}
