import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { AdminService } from '../admin.service';

/**
 * Production startup must never be able to use a predictable JWT secret:
 * the strategy reads JWT_SECRET through ConfigService.getOrThrow, so
 * constructing it without a configured secret must fail immediately.
 */
describe('Admin JwtStrategy (no fallback secret)', () => {
  const adminServiceMock = {
    findByEmail: jest.fn(),
  } as unknown as AdminService;

  function makeConfig(secret?: string): ConfigService {
    return {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'JWT_SECRET' && secret !== undefined) {
          return secret;
        }
        throw new Error('Config variable "JWT_SECRET" is required');
      }),
    } as unknown as ConfigService;
  }

  it('fails to construct when JWT_SECRET is absent', () => {
    expect(() => new JwtStrategy(adminServiceMock, makeConfig())).toThrow(
      /JWT_SECRET/,
    );
  });

  it('constructs when JWT_SECRET is configured', () => {
    expect(
      () => new JwtStrategy(adminServiceMock, makeConfig('a-real-secret')),
    ).not.toThrow();
  });

  it('uses the configured secret, never a hard-coded default', async () => {
    const strategy = new JwtStrategy(
      adminServiceMock,
      makeConfig('configured-secret-value'),
    );
    // passport-jwt resolves the secret through its internal provider;
    // assert it is exactly what configuration provided — never
    // 'supersecret' or another predictable default.
    const resolved = await new Promise<string>((resolve) => {
      (strategy as unknown as {
        _secretOrKeyProvider: (
          _req: unknown,
          _token: string,
          done: (err: unknown, secret: string) => void,
        ) => void;
      })._secretOrKeyProvider({}, 'token', (_err, secret) => resolve(secret));
    });
    expect(resolved).toBe('configured-secret-value');
    expect(resolved).not.toBe('supersecret');
  });

  it('rejects an empty JWT_SECRET as if it were missing', () => {
    expect(() => new JwtStrategy(adminServiceMock, makeConfig(''))).toThrow();
  });
});
