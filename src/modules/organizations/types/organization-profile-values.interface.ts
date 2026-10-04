/**
 * The country-dependent profile fields `OrganizationProfileService` checks —
 * satisfied by both an incoming DTO and a merged `Organization` entity, so
 * a partial PATCH is validated against the values it will actually save.
 */
export interface OrganizationProfileValues {
  country?: string | null;
  region?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  postcode?: string | null;
  timezone?: string | null;
  businessNumber?: string | null;
}
