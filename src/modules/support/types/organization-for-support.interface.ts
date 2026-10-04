/** One row of `GET /support/organizations` — an org plus its inferred owner's name. */
export interface OrganizationForSupport {
  id: string;
  name: string;
  slug: string;
  /** Full name of the owner user linked to this org; null if it has none yet. */
  ownerName: string | null;
  createdAt: Date;
}
