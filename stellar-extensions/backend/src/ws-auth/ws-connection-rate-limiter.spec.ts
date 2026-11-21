import { describe, expect, it } from '@jest/globals';
import { WS_AUTH_DEFAULTS } from './ws-auth.constants';
import { WsConnectionRateLimiter } from './ws-connection-rate-limiter';

describe('WsConnectionRateLimiter', () => {
  it('allows attempts up to the configured maximum', () => {
    const limiter = new WsConnectionRateLimiter(3, 1_000, () => 0);

    expect(limiter.consume('1.2.3.4')).toMatchObject({ allowed: true, remaining: 2 });
    expect(limiter.consume('1.2.3.4')).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.consume('1.2.3.4')).toMatchObject({ allowed: true, remaining: 0 });
  });

  it('denies attempts over the limit and reports a retry delay', () => {
    let clock = 0;
    const limiter = new WsConnectionRateLimiter(2, 1_000, () => clock);
    limiter.consume('1.2.3.4');
    clock += 400;
    limiter.consume('1.2.3.4');

    const decision = limiter.consume('1.2.3.4');

    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
    expect(decision.retryAfterMs).toBe(600);
  });

  it('frees the window once old attempts slide out', () => {
    let clock = 0;
    const limiter = new WsConnectionRateLimiter(1, 1_000, () => clock);
    expect(limiter.consume('1.2.3.4').allowed).toBe(true);
    expect(limiter.consume('1.2.3.4').allowed).toBe(false);

    clock += 1_001;
    expect(limiter.consume('1.2.3.4').allowed).toBe(true);
  });

  it('scopes counters per key', () => {
    const limiter = new WsConnectionRateLimiter(1, 1_000, () => 0);
    expect(limiter.consume('1.2.3.4').allowed).toBe(true);
    expect(limiter.consume('5.6.7.8').allowed).toBe(true);
  });

  it('resets one key or all keys', () => {
    const limiter = new WsConnectionRateLimiter(1, 1_000, () => 0);
    limiter.consume('a');
    limiter.consume('b');

    limiter.reset('a');
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('b').allowed).toBe(false);

    limiter.reset();
    expect(limiter.consume('b').allowed).toBe(true);
  });

  it('defaults to the documented window and attempt count', () => {
    const limiter = new WsConnectionRateLimiter();

    for (let attempt = 0; attempt < WS_AUTH_DEFAULTS.maxConnectionAttempts; attempt += 1) {
      expect(limiter.consume('1.2.3.4').allowed).toBe(true);
    }
    expect(limiter.consume('1.2.3.4').allowed).toBe(false);
  });
});
