import type { ConfigService } from '@nestjs/config';
import type { ProviderConnection } from '@modules/providers/entities';
import { ProviderType } from '@modules/providers/entities';
import type { ProviderConnectionsService } from '@modules/providers/services';
import { buildOAuthState } from '@common/utils';
import { QuickbooksAuthService } from './quickbooks-auth.service';

/**
 * Regression coverage for the multi-tenant OAuth connection fix:
 *
 *  - the organization starting `/quickbooks/connect` is carried securely
 *    through the signed OAuth `state` and associated with the returned
 *    realm/tokens the moment the callback succeeds (`exchangeToken`), and
 *  - once that association exists, `ensureProviderConnection`/
 *    `getSessionForOrganization` resolve ONLY that organization's own
 *    `ProviderConnection` — never the legacy `quickbooks_connections`
 *    table's globally "most recently updated" row, even on an
 *    organization's very first poll.
 */

const APP_CONFIG = {
  quickbooks: {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    environment: 'sandbox',
    redirectUri: 'https://app.example.com/quickbooks/callback',
  },
  auth: { frontendUrl: 'https://app.example.com' },
};

const FAR_FUTURE = new Date(Date.now() + 60 * 60 * 1000);

/** Builds just enough of a `ProviderConnection` for these tests — cast past the rest of the entity's columns. */
function fakeConnection(
  overrides: Partial<ProviderConnection> & {
    organizationId: string;
    externalRealmId: string;
  },
): ProviderConnection {
  return {
    id: `pc-${overrides.organizationId}`,
    provider: ProviderType.QUICKBOOKS,
    accessTokenExpiresAt: FAR_FUTURE,
    refreshTokenExpiresAt: FAR_FUTURE,
    ...overrides,
  } as unknown as ProviderConnection;
}

function createConfigService() {
  return {
    getOrThrow: jest.fn().mockReturnValue(APP_CONFIG),
  } as unknown as ConfigService;
}

function createProviderConnectionsService() {
  return {
    findWithTokensOrNull: jest.fn(),
    findLatestWithTokensOrNull: jest.fn(),
    upsertTokens: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<
      ProviderConnectionsService,
      'findWithTokensOrNull' | 'findLatestWithTokensOrNull' | 'upsertTokens'
    >
  >;
}

/** A successful Intuit token exchange, shaped like `AuthResponse.getJson()`. */
function fakeTokenResponse(overrides: {
  accessToken: string;
  refreshToken: string;
}) {
  return {
    getJson: () => ({
      access_token: overrides.accessToken,
      refresh_token: overrides.refreshToken,
      expires_in: 3600,
      x_refresh_token_expires_in: 8_640_000,
    }),
  };
}

describe('QuickbooksAuthService', () => {
  let providerConnections: ReturnType<typeof createProviderConnectionsService>;
  let service: QuickbooksAuthService;

  beforeEach(() => {
    providerConnections = createProviderConnectionsService();
    service = new QuickbooksAuthService(
      createConfigService(),
      providerConnections as unknown as ProviderConnectionsService,
    );
  });

  const oauthClient = () =>
    (
      service as unknown as {
        oauthClient: { createToken: jest.Mock; refreshUsingToken: jest.Mock };
      }
    ).oauthClient;

  describe('OAuth connect -> callback association', () => {
    it("associates Company A's realm/tokens with Organization A via the signed state", async () => {
      const state = buildOAuthState(
        APP_CONFIG.quickbooks.clientSecret,
        'org-A',
      );
      oauthClient().createToken = jest.fn().mockResolvedValue(
        fakeTokenResponse({
          accessToken: 'token-A',
          refreshToken: 'refresh-A',
        }),
      );

      const dto = {
        code: 'auth-code',
        state,
        realmId: 'REALM_A',
      };
      await service.handleCallback(
        { code: 'auth-code', state, realmId: 'REALM_A' },
        dto,
      );

      expect(providerConnections.upsertTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-A',
          provider: ProviderType.QUICKBOOKS,
          externalRealmId: 'REALM_A',
          accessToken: 'token-A',
          refreshToken: 'refresh-A',
        }),
      );
    });

    it("associates Company B's realm/tokens with Organization B via the signed state", async () => {
      const state = buildOAuthState(
        APP_CONFIG.quickbooks.clientSecret,
        'org-B',
      );
      oauthClient().createToken = jest.fn().mockResolvedValue(
        fakeTokenResponse({
          accessToken: 'token-B',
          refreshToken: 'refresh-B',
        }),
      );

      const dto = {
        code: 'auth-code',
        state,
        realmId: 'REALM_B',
      };
      await service.handleCallback(
        { code: 'auth-code', state, realmId: 'REALM_B' },
        dto,
      );

      expect(providerConnections.upsertTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-B',
          externalRealmId: 'REALM_B',
          accessToken: 'token-B',
          refreshToken: 'refresh-B',
        }),
      );
    });

    it('rejects a callback with a tampered state and never associates any ProviderConnection', async () => {
      const state = buildOAuthState(
        APP_CONFIG.quickbooks.clientSecret,
        'org-A',
      );
      const tampered = state.slice(0, -1) + (state.endsWith('a') ? 'b' : 'a');
      oauthClient().createToken = jest.fn();

      const dto = {
        code: 'auth-code',
        state: tampered,
        realmId: 'REALM_A',
      };
      const redirectUrl = await service.handleCallback(
        { code: 'auth-code', state: tampered, realmId: 'REALM_A' },
        dto,
      );

      expect(redirectUrl).toContain('quickbooks=error');
      expect(oauthClient().createToken).not.toHaveBeenCalled();
      expect(providerConnections.upsertTokens).not.toHaveBeenCalled();
    });

    it('rejects an expired state and never associates any ProviderConnection', async () => {
      const now = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
      const state = buildOAuthState(
        APP_CONFIG.quickbooks.clientSecret,
        'org-A',
      );
      nowSpy.mockReturnValue(now + 11 * 60 * 1000); // past the 10-minute TTL

      const dto = {
        code: 'auth-code',
        state,
        realmId: 'REALM_A',
      };
      const redirectUrl = await service.handleCallback(
        { code: 'auth-code', state, realmId: 'REALM_A' },
        dto,
      );

      expect(redirectUrl).toContain('quickbooks=error');
      expect(providerConnections.upsertTokens).not.toHaveBeenCalled();
      nowSpy.mockRestore();
    });
  });

  describe('ensureProviderConnection / getSessionForOrganization — multi-tenant isolation', () => {
    it('throws for an organization that has never connected — never falls back to another connection', async () => {
      providerConnections.findWithTokensOrNull.mockResolvedValue(null);

      await expect(service.ensureProviderConnection('org-A')).rejects.toThrow();
      expect(providerConnections.upsertTokens).not.toHaveBeenCalled();
    });

    it("Organization A's first poll resolves Company A even though Organization B is also connected", async () => {
      providerConnections.findWithTokensOrNull.mockImplementation(
        (organizationId: string) =>
          Promise.resolve(
            organizationId === 'org-A'
              ? fakeConnection({
                  organizationId: 'org-A',
                  externalRealmId: 'REALM_A',
                  accessToken: 'token-A',
                  refreshToken: 'refresh-A',
                })
              : fakeConnection({
                  organizationId: 'org-B',
                  externalRealmId: 'REALM_B',
                  accessToken: 'token-B',
                  refreshToken: 'refresh-B',
                }),
          ),
      );

      const sessionA = await service.getSessionForOrganization('org-A');

      expect(sessionA).toEqual({ realmId: 'REALM_A', accessToken: 'token-A' });
    });

    it("Organization B's first poll resolves Company B even though Organization A is also connected", async () => {
      providerConnections.findWithTokensOrNull.mockImplementation(
        (organizationId: string) =>
          Promise.resolve(
            organizationId === 'org-B'
              ? fakeConnection({
                  organizationId: 'org-B',
                  externalRealmId: 'REALM_B',
                  accessToken: 'token-B',
                  refreshToken: 'refresh-B',
                })
              : fakeConnection({
                  organizationId: 'org-A',
                  externalRealmId: 'REALM_A',
                  accessToken: 'token-A',
                  refreshToken: 'refresh-A',
                }),
          ),
      );

      const sessionB = await service.getSessionForOrganization('org-B');

      expect(sessionB).toEqual({ realmId: 'REALM_B', accessToken: 'token-B' });
    });

    it('resolves each organization to its own realm independently (Org A -> Realm A, Org B -> Realm B)', async () => {
      providerConnections.findWithTokensOrNull.mockImplementation(
        (organizationId: string) =>
          Promise.resolve(
            fakeConnection({
              organizationId,
              externalRealmId:
                organizationId === 'org-A' ? 'REALM_A' : 'REALM_B',
              accessToken: organizationId === 'org-A' ? 'token-A' : 'token-B',
              refreshToken:
                organizationId === 'org-A' ? 'refresh-A' : 'refresh-B',
            }),
          ),
      );

      const sessionA = await service.getSessionForOrganization('org-A');
      const sessionB = await service.getSessionForOrganization('org-B');

      expect(sessionA).toEqual({ realmId: 'REALM_A', accessToken: 'token-A' });
      expect(sessionB).toEqual({ realmId: 'REALM_B', accessToken: 'token-B' });
    });
  });

  describe('token refresh isolation', () => {
    it("refreshes Organization A's own connection in place without ever mixing in Organization B's credentials", async () => {
      const expired = new Date(Date.now() - 1000);
      providerConnections.findWithTokensOrNull.mockResolvedValue(
        fakeConnection({
          organizationId: 'org-A',
          externalRealmId: 'REALM_A',
          accessToken: 'stale-token-A',
          refreshToken: 'refresh-A',
          accessTokenExpiresAt: expired,
        }),
      );
      providerConnections.upsertTokens.mockResolvedValue(
        fakeConnection({
          organizationId: 'org-A',
          externalRealmId: 'REALM_A',
          accessToken: 'fresh-token-A',
          refreshToken: 'fresh-refresh-A',
        }),
      );
      oauthClient().refreshUsingToken = jest.fn().mockResolvedValue(
        fakeTokenResponse({
          accessToken: 'fresh-token-A',
          refreshToken: 'fresh-refresh-A',
        }),
      );

      const refreshed = await service.ensureProviderConnection('org-A');

      expect(oauthClient().refreshUsingToken).toHaveBeenCalledWith('refresh-A');
      expect(providerConnections.upsertTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-A',
          externalRealmId: 'REALM_A',
          accessToken: 'fresh-token-A',
        }),
      );
      // Every write for this refresh is scoped to org-A alone.
      expect(providerConnections.upsertTokens).toHaveBeenCalledTimes(1);
      expect(refreshed.externalRealmId).toBe('REALM_A');
    });
  });
});
