import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtGuard } from './jwt.guard';
import { VerificationService } from '../services/verification.service';

describe('JwtGuard', () => {
  let guard: JwtGuard;
  let verificationService: jest.Mocked<VerificationService>;
  let reflector: jest.Mocked<Reflector>;

  const createMockContext = (headers: Record<string, string>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          tokenPayload: undefined,
          tokenExpiresAt: undefined,
        }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    verificationService = {
      extractTokenFromHeader: jest.fn(),
      validateJwtToken: jest.fn(),
    } as unknown as jest.Mocked<VerificationService>;

    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtGuard,
        { provide: VerificationService, useValue: verificationService },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();

    guard = module.get<JwtGuard>(JwtGuard);
  });

  it('allows activation with a valid token', async () => {
    const context = createMockContext({ authorization: 'Bearer valid.jwt' });
    verificationService.extractTokenFromHeader.mockReturnValue('valid.jwt');
    verificationService.validateJwtToken.mockResolvedValue({
      isValid: true,
      payload: { sub: 'user-123' },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('throws when authorization header is missing', async () => {
    const context = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws when authorization header format is invalid', async () => {
    const context = createMockContext({ authorization: 'Basic token' });
    verificationService.extractTokenFromHeader.mockReturnValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws when token validation fails', async () => {
    const context = createMockContext({ authorization: 'Bearer invalid.jwt' });
    verificationService.extractTokenFromHeader.mockReturnValue('invalid.jwt');
    verificationService.validateJwtToken.mockResolvedValue({
      isValid: false,
      error: 'jwt expired',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('attaches token payload to request on success', async () => {
    const request: any = { headers: { authorization: 'Bearer valid.jwt' } };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;

    verificationService.extractTokenFromHeader.mockReturnValue('valid.jwt');
    verificationService.validateJwtToken.mockResolvedValue({
      isValid: true,
      payload: { sub: 'user-123' },
      expiresAt: new Date(),
    });

    await guard.canActivate(context);

    expect(request.tokenPayload).toEqual({ sub: 'user-123' });
    expect(request.tokenExpiresAt).toBeInstanceOf(Date);
  });

  it('passes options from reflector to validation', async () => {
    const context = createMockContext({ authorization: 'Bearer my.token' });
    verificationService.extractTokenFromHeader.mockReturnValue('my.token');
    verificationService.validateJwtToken.mockResolvedValue({
      isValid: true,
      payload: { sub: 'user-123' },
    });
    reflector.getAllAndOverride.mockReturnValue({ audience: 'myapp' });

    await guard.canActivate(context);

    expect(verificationService.validateJwtToken).toHaveBeenCalledWith(
      'my.token',
      { audience: 'myapp' },
    );
  });
});
