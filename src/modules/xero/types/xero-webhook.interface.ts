/** One entry of a Xero webhook's `events[]` — a change notification only, never the changed data. */
export interface XeroWebhookEvent {
  resourceUrl?: string;
  resourceId?: string;
  eventDateUtc?: string;
  eventType?: string;
  eventCategory?: string;
  tenantId?: string;
  tenantType?: string;
}

/** Webhook body. The intent-to-receive validation request has an empty `events` array. */
export interface XeroWebhookPayload {
  events?: XeroWebhookEvent[];
  firstEventSequence?: number;
  lastEventSequence?: number;
  entropy?: string;
}
