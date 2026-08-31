import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { APIKeyGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';

function mockContext(request: Record<string, any>): any {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

describe('APIKeyGuard', () => {
  let guard: APIKeyGuard;
  let serviceMock: { validateApiKey: jest.Mock };

  beforeEach(async () => {
    serviceMock = { validateApiKey: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        APIKeyGuard,
        { provide: ApiKeyService, useValue: serviceMock },
      ],
    }).compile();
    guard = moduleRef.get(APIKeyGuard);
  });

  it('rejects requests without an x-api-key header', async () => {
    const ctx = mockContext({ headers: {}, path: '/api-keys/protected' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('passes the route pattern to the service for scope checks', async () => {
    serviceMock.validateApiKey.mockReturnValue(true);
    const ctx = mockContext({
      headers: { 'x-api-key': 'sh_valid' },
      route: { path: '/api-keys/protected' },
      path: '/api/v1/api-keys/protected',
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(serviceMock.validateApiKey).toHaveBeenCalledWith(
      'sh_valid',
      '/api-keys/protected',
    );
  });

  it('rejects keys the service deems invalid for the endpoint', async () => {
    serviceMock.validateApiKey.mockReturnValue(false);
    const ctx = mockContext({
      headers: { 'x-api-key': 'sh_scoped-elsewhere' },
      route: { path: '/api-keys/protected' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(serviceMock.validateApiKey).toHaveBeenCalledWith(
      'sh_scoped-elsewhere',
      '/api-keys/protected',
    );
  });

  it('falls back to the raw path when no route pattern is available', async () => {
    serviceMock.validateApiKey.mockReturnValue(true);
    const ctx = mockContext({
      headers: { 'x-api-key': 'sh_valid' },
      path: '/some/raw/path',
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(serviceMock.validateApiKey).toHaveBeenCalledWith(
      'sh_valid',
      '/some/raw/path',
    );
  });
});
