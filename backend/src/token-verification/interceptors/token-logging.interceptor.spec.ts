import { Test, TestingModule } from '@nestjs/testing';
import type { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { TokenLoggingInterceptor } from './token-logging.interceptor';
import { VerificationService } from '../services/verification.service';

describe('TokenLoggingInterceptor', () => {
  let interceptor: TokenLoggingInterceptor;
  let verificationService: jest.Mocked<VerificationService>;

  const mockRequest = (overrides: Record<string, any> = {}) => ({
    headers: { authorization: 'Bearer test.jwt.token' },
    method: 'GET',
    url: '/api/test',
    tokenPayload: undefined,
    walletPayload: undefined,
    ...overrides,
  });

  const mockResponse = () => ({});

  const createMockContext = (request: Record<string, any>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: mockResponse,
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  const mockCallHandler: CallHandler = {
    handle: () => of({ success: true }),
  };

  beforeEach(async () => {
    verificationService = {
      extractTokenFromHeader: jest.fn(),
    } as unknown as jest.Mocked<VerificationService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenLoggingInterceptor,
        { provide: VerificationService, useValue: verificationService },
      ],
    }).compile();

    interceptor = module.get<TokenLoggingInterceptor>(TokenLoggingInterceptor);
  });

  it('logs token usage when auth header is present', (done) => {
    const request = mockRequest();
    verificationService.extractTokenFromHeader.mockReturnValue(
      'test.jwt.token',
    );

    interceptor
      .intercept(createMockContext(request), mockCallHandler)
      .subscribe(() => {
        expect(verificationService.extractTokenFromHeader).toHaveBeenCalledWith(
          'Bearer test.jwt.token',
        );
        done();
      });
  });

  it('does not log when auth header is missing', (done) => {
    const request = mockRequest({ headers: {} });
    verificationService.extractTokenFromHeader.mockReturnValue(null);

    interceptor
      .intercept(createMockContext(request), mockCallHandler)
      .subscribe(() => {
        expect(
          verificationService.extractTokenFromHeader,
        ).not.toHaveBeenCalled();
        done();
      });
  });

  it('logs successful JWT verification on response', (done) => {
    const request = mockRequest({
      tokenPayload: { sub: 'user-456' },
    });
    verificationService.extractTokenFromHeader.mockReturnValue(
      'test.jwt.token',
    );

    interceptor
      .intercept(createMockContext(request), mockCallHandler)
      .subscribe(() => {
        done();
      });
  });

  it('logs successful wallet verification on response', (done) => {
    const request = mockRequest({
      walletPayload: { address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e' },
    });

    interceptor
      .intercept(createMockContext(request), mockCallHandler)
      .subscribe(() => {
        done();
      });
  });

  it('handles request without token or wallet payload', (done) => {
    const request = mockRequest({
      headers: {},
      tokenPayload: undefined,
      walletPayload: undefined,
    });

    interceptor
      .intercept(createMockContext(request), mockCallHandler)
      .subscribe(() => {
        done();
      });
  });
});
