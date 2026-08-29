import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyService, ApiKeyStatus } from './api-key.service';

describe('ApiKeyController', () => {
  let controller: ApiKeyController;
  let serviceMock: any;

  const mockKey = {
    key: 'k-1',
    ownerLabel: 'owner',
    status: ApiKeyStatus.ACTIVE,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    serviceMock = {
      generateApiKey: jest.fn().mockReturnValue(mockKey),
      revokeApiKey: jest.fn().mockReturnValue({ ...mockKey, status: ApiKeyStatus.REVOKED }),
      getAllApiKeys: jest.fn().mockReturnValue([mockKey]),
      validateApiKey: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeyController],
      providers: [{ provide: ApiKeyService, useValue: serviceMock }],
    }).compile();

    controller = module.get<ApiKeyController>(ApiKeyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('generates API key', () => {
    const res = controller.generateApiKey({ ownerLabel: 'owner', isAdmin: true });
    expect(res).toEqual(mockKey);
    expect(serviceMock.generateApiKey).toHaveBeenCalledWith('owner', true, undefined);
  });

  it('revokes API key', () => {
    const res = controller.revokeApiKey('k-1', { isAdmin: true });
    expect(res.status).toBe(ApiKeyStatus.REVOKED);
    expect(serviceMock.revokeApiKey).toHaveBeenCalledWith('k-1', true);
  });

  it('gets all API keys', () => {
    const res = controller.getAllApiKeys({ isAdmin: true });
    expect(res).toEqual([mockKey]);
    expect(serviceMock.getAllApiKeys).toHaveBeenCalledWith(true);
  });

  it('accesses protected data endpoint', () => {
    const res = controller.getProtectedData();
    expect(res.message).toBeDefined();
  });
});
