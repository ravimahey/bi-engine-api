/** The only two values a caller needs to hit the Accounting API — never the refresh token. */
export interface XeroSession {
  tenantId: string;
  accessToken: string;
}

/** Fields read from `POST https://identity.xero.com/connect/token` (authorization_code and refresh_token grants alike). */
export interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  id_token?: string;
  scope?: string;
}
