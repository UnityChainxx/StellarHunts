import type { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { TokenHeaderInterceptor } from './token-header.interceptor';

describe('TokenHeaderInterceptor', () => {
  let interceptor: TokenHeaderInterceptor;

  const createMockContext = (requestOverrides: Record<string, any> = {}) => {
    const response = { setHeader: jest.fn() };
    const request = {
      tokenExpiresAt: undefined,
      tokenPayload: undefined,
      walletPayload: undefined,
      ...requestOverrides,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  };

  const mockCallHandler: CallHandler = {
    handle: () => of({ success: true }),
  };

  beforeEach(() => {
    interceptor = new TokenHeaderInterceptor();
  });

  it('sets X-Token-Expires-At header when tokenExpiresAt is present', (done) => {
    const expiresAt = new Date('2026-12-31T23:59:59Z');
    const context = createMockContext({ tokenExpiresAt: expiresAt });
    const response = context.switchToHttp().getResponse();

    interceptor.intercept(context, mockCallHandler).subscribe(() => {
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-Token-Expires-At',
        expiresAt.toISOString(),
      );
      done();
    });
  });

  it('sets X-Token-Subject header when tokenPayload.sub exists', (done) => {
    const context = createMockContext({
      tokenPayload: { sub: 'user-789' },
    });
    const response = context.switchToHttp().getResponse();

    interceptor.intercept(context, mockCallHandler).subscribe(() => {
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-Token-Subject',
        'user-789',
      );
      done();
    });
  });

  it('sets X-Wallet-Address header when walletPayload.address exists', (done) => {
    const context = createMockContext({
      walletPayload: { address: '0x123' },
    });
    const response = context.switchToHttp().getResponse();

    interceptor.intercept(context, mockCallHandler).subscribe(() => {
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-Wallet-Address',
        '0x123',
      );
      done();
    });
  });

  it('does not set any headers when no token data is present', (done) => {
    const context = createMockContext();
    const response = context.switchToHttp().getResponse();

    interceptor.intercept(context, mockCallHandler).subscribe(() => {
      expect(response.setHeader).not.toHaveBeenCalled();
      done();
    });
  });

  it('passes through the response data unchanged', (done) => {
    const context = createMockContext();

    interceptor.intercept(context, mockCallHandler).subscribe((data) => {
      expect(data).toEqual({ success: true });
      done();
    });
  });
});
