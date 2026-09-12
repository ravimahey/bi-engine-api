/** The only two fields a caller needs to hit the QuickBooks API — never the raw tokens. */
export interface QuickbooksSession {
  realmId: string;
  accessToken: string;
}

/** The fields we need from `AuthResponse.getJson()` — typed `any` upstream in `intuit-oauth`. */
export interface QuickbooksTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
}
