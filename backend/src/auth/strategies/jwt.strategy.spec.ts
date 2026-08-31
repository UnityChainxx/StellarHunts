import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from '../services/auth.service';

/**
 * The user JWT strategy must never silently fall back to a predictable
 * secret: it resolves JWT_SECRET via ConfigService.getOrThrow, so building
 * it without a configured secret fails at startup instead.
 */
describe('User JwtStrategy (no fallback secret)', () => {
  const authServiceMock = {
    validateUser: jest.fn(),
  } as unknown as AuthService;

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
    expect(() => new JwtStrategy(authServiceMock, makeConfig())).toThrow(
      /JWT_SECRET/,
    );
  });

  it('constructs when JWT_SECRET is configured', () => {
    expect(
      () => new JwtStrategy(authServiceMock, makeConfig('a-real-secret')),
    ).not.toThrow();
  });

  it('uses the configured secret, never a hard-coded default', async () => {
    const strategy = new JwtStrategy(
      authServiceMock,
      makeConfig('configured-secret-value'),
    );
    // passport-jwt resolves the secret through its internal provider;
    // assert it is exactly what configuration provided — never
    // 'your-secret-key' or another predictable default.
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
    expect(resolved).not.toBe('your-secret-key');
  });

  it('rejects an empty JWT_SECRET as if it were missing', () => {
    expect(() => new JwtStrategy(authServiceMock, makeConfig(''))).toThrow();
  });
});
