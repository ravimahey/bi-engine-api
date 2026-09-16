/** Shape of the JSON body QuickBooks returns on a non-2xx Accounting API response. */
export interface QuickbooksFault {
  Fault?: {
    Error?: Array<{ Message?: string; Detail?: string; code?: string }>;
  };
}
