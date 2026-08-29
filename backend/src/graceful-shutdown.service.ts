import {
  Injectable,
  Logger,
  BeforeApplicationShutdown,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';

/**
 * GracefulShutdownService
 * -----------------------
 * Stops every registered scheduled job (cron, interval, timeout) when the
 * application begins shutting down. This prevents new matchmaking / cleanup
 * cycles from starting mid-shutdown and lets any in-flight cycle finish
 * before the process exits (#GracefulShutdown).
 *
 * It runs during `beforeApplicationShutdown` (before the HTTP server stops
 * accepting connections) so that already-running jobs are given the chance
 * to complete within the DB transaction boundary they were started in.
 */
@Injectable()
export class GracefulShutdownService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(GracefulShutdownService.name);

  constructor(private readonly schedulerRegistry: SchedulerRegistry) {}

  beforeApplicationShutdown(signal?: string): void {
    try {
      const crons = this.schedulerRegistry.getCronJobs();
      crons.forEach((job, name) => {
        job.stop();
        this.schedulerRegistry.deleteCronJob(name);
      });

      this.schedulerRegistry.getIntervals().forEach((name) => {
        this.schedulerRegistry.deleteInterval(name);
      });

      this.schedulerRegistry.getTimeouts().forEach((name) => {
        this.schedulerRegistry.deleteTimeout(name);
      });

      this.logger.log(
        `Stopped ${crons.size} cron job(s) on signal "${signal}".`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to stop scheduled jobs: ${(err as Error).message}`,
      );
    }
  }
}
