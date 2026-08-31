import { GracefulShutdownService } from './graceful-shutdown.service';
import type { SchedulerRegistry } from '@nestjs/schedule';

describe('GracefulShutdownService', () => {
  function buildService() {
    const cronJob = { stop: jest.fn() };
    const schedulerRegistry = {
      getCronJobs: jest.fn(() => new Map([['matchmaking', cronJob]])),
      deleteCronJob: jest.fn(),
      getIntervals: jest.fn(() => ['heartbeat']),
      deleteInterval: jest.fn(),
      getTimeouts: jest.fn(() => ['deferred']),
      deleteTimeout: jest.fn(),
    } as unknown as SchedulerRegistry;

    const service = new GracefulShutdownService(schedulerRegistry);
    return { service, schedulerRegistry, cronJob };
  }

  it('stops and removes every cron job on shutdown', () => {
    const { service, schedulerRegistry, cronJob } = buildService();

    service.beforeApplicationShutdown('SIGTERM');

    expect(cronJob.stop).toHaveBeenCalledTimes(1);
    expect(schedulerRegistry.deleteCronJob).toHaveBeenCalledWith('matchmaking');
  });

  it('clears intervals and timeouts on shutdown', () => {
    const { service, schedulerRegistry } = buildService();

    service.beforeApplicationShutdown('SIGINT');

    expect(schedulerRegistry.deleteInterval).toHaveBeenCalledWith('heartbeat');
    expect(schedulerRegistry.deleteTimeout).toHaveBeenCalledWith('deferred');
  });

  it('does not throw when the registry reports no jobs', () => {
    const { service, schedulerRegistry } = buildService();
    (schedulerRegistry.getCronJobs as jest.Mock).mockReturnValue(new Map());

    expect(() => service.beforeApplicationShutdown('SIGTERM')).not.toThrow();
  });
});
