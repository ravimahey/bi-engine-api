import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, type TestingModule } from '@nestjs/testing';
import { SignalType } from '@modules/signals/entities';
import { SignalsService } from '@modules/signals/services';
import {
  ConnectionStatus,
  ProviderConnection,
  ProviderType,
} from '../entities';
import { ConnectionSignalsService } from './connection-signals.service';
import { ProviderConnectionsService } from './provider-connections.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '22222222-2222-4222-8222-222222222222';

const connection = (status: ConnectionStatus) =>
  ({
    id: CONNECTION,
    organizationId: ORG,
    provider: ProviderType.QUICKBOOKS,
    status,
  }) as ProviderConnection;

const tokens = {
  organizationId: ORG,
  provider: ProviderType.QUICKBOOKS,
  externalRealmId: 'realm-1',
  accessToken: 'access',
  refreshToken: 'refresh',
  accessTokenExpiresAt: new Date(),
  refreshTokenExpiresAt: new Date(),
};

describe('ProviderConnectionsService → sync_error signal', () => {
  let service: ProviderConnectionsService;
  let repo: {
    findOne: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let signals: { createSignal: jest.Mock; resolveSignal: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((partial: Partial<ProviderConnection>) => partial),
      save: jest.fn((entity: ProviderConnection) =>
        Promise.resolve({ ...entity, id: CONNECTION }),
      ),
    };
    signals = {
      createSignal: jest.fn().mockResolvedValue({}),
      resolveSignal: jest.fn().mockResolvedValue(1),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderConnectionsService,
        ConnectionSignalsService,
        { provide: getRepositoryToken(ProviderConnection), useValue: repo },
        { provide: SignalsService, useValue: signals },
      ],
    }).compile();
    service = module.get(ProviderConnectionsService);
  });

  const key = {
    organizationId: ORG,
    type: SignalType.SYNC_ERROR,
    sourceId: CONNECTION,
  };

  it('connected → error raises one sync_error signal for the owning org', async () => {
    repo.findOne.mockResolvedValue(connection(ConnectionStatus.CONNECTED));

    await service.markError(CONNECTION, 'invalid_grant');

    expect(repo.update).toHaveBeenCalledWith(CONNECTION, {
      status: ConnectionStatus.ERROR,
      lastError: 'invalid_grant',
    });
    expect(signals.createSignal).toHaveBeenCalledTimes(1);
    expect(signals.createSignal).toHaveBeenCalledWith({
      ...key,
      message: 'QuickBooks sync failed — reconnect required.',
    });
  });

  it('failing again while already in error does not raise another signal', async () => {
    repo.findOne.mockResolvedValue(connection(ConnectionStatus.ERROR));

    await service.markError(CONNECTION, 'still broken');

    expect(repo.update).toHaveBeenCalled();
    expect(signals.createSignal).not.toHaveBeenCalled();
  });

  it('error → connected (tokens refreshed) resolves the signal', async () => {
    repo.findOne.mockResolvedValue(connection(ConnectionStatus.ERROR));

    await service.upsertTokens(tokens);

    expect(signals.resolveSignal).toHaveBeenCalledWith(key);
  });

  it('an ordinary token refresh touches no signal', async () => {
    repo.findOne.mockResolvedValue(connection(ConnectionStatus.CONNECTED));

    await service.upsertTokens(tokens);

    expect(signals.resolveSignal).not.toHaveBeenCalled();
    expect(signals.createSignal).not.toHaveBeenCalled();
  });

  it('disconnecting an errored connection resolves the signal', async () => {
    repo.findOne.mockResolvedValue(connection(ConnectionStatus.ERROR));

    await service.markDisconnected(CONNECTION);

    expect(signals.resolveSignal).toHaveBeenCalledWith(key);
  });

  it('a signal failure never fails the status change', async () => {
    repo.findOne.mockResolvedValue(connection(ConnectionStatus.CONNECTED));
    signals.createSignal.mockRejectedValue(new Error('db down'));

    await expect(
      service.markError(CONNECTION, 'invalid_grant'),
    ).resolves.toBeUndefined();
    expect(repo.update).toHaveBeenCalled();
  });
});
