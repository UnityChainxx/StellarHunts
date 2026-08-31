import { HealthCheckError } from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis-health.indicator';

describe('RedisHealthIndicator', () => {
  it('reports healthy when ping returns PONG', async () => {
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const indicator = new RedisHealthIndicator(redis as never);

    await expect(indicator.pingCheck('redis')).resolves.toMatchObject({
      redis: { status: 'up' },
    });
  });

  it('fails when ping rejects', async () => {
    const redis = { ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const indicator = new RedisHealthIndicator(redis as never);

    await expect(indicator.pingCheck('redis')).rejects.toBeInstanceOf(
      HealthCheckError,
    );
  });

  it('fails when ping times out', async () => {
    jest.useFakeTimers();
    const redis = {
      ping: jest.fn(
        () => new Promise((resolve) => setTimeout(() => resolve('PONG'), 5000)),
      ),
    };
    const indicator = new RedisHealthIndicator(redis as never);

    const assertion = expect(indicator.pingCheck('redis', 50)).rejects.toBeInstanceOf(
      HealthCheckError,
    );
    jest.advanceTimersByTime(100);
    await assertion;
    jest.useRealTimers();
  });
});
