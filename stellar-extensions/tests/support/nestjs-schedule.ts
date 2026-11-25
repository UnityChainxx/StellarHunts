/**
 * Test-only CommonJS shim for `@nestjs/schedule`.
 *
 * v12 is published as pure ESM, which Jest cannot require. Services under
 * test only use the `@Cron` decorator surface at class-definition time; the
 * decorator is a no-op here because specs construct services directly and
 * never boot the scheduler.
 */

const noopDecorator = (..._args: unknown[]) => () => undefined;

export const Cron = noopDecorator;
export const Interval = noopDecorator;
export const Timeout = noopDecorator;

export const CronExpression = {
  EVERY_SECOND: '* * * * * *',
  EVERY_5_SECONDS: '*/5 * * * * *',
  EVERY_10_SECONDS: '*/10 * * * * *',
  EVERY_30_SECONDS: '*/30 * * * * *',
  EVERY_MINUTE: '* * * * *',
  EVERY_5_MINUTES: '*/5 * * * *',
  EVERY_10_MINUTES: '*/10 * * * *',
  EVERY_30_MINUTES: '*/30 * * * *',
  EVERY_HOUR: '0 * * * *',
  EVERY_DAY_AT_MIDNIGHT: '0 0 * * *',
  EVERY_DAY_AT_1AM: '0 1 * * *',
  EVERY_DAY_AT_2AM: '0 2 * * *',
  EVERY_DAY_AT_3AM: '0 3 * * *',
  EVERY_DAY_AT_4AM: '0 4 * * *',
  EVERY_DAY_AT_5AM: '0 5 * * *',
  EVERY_DAY_AT_6AM: '0 6 * * *',
  EVERY_WEEK: '0 0 * * 0',
  EVERY_MONTH: '0 0 1 * *',
} as const;

export class SchedulerRegistry {}
export class SchedulerOrchestrator {}

export default {
  Cron,
  Interval,
  Timeout,
  CronExpression,
  SchedulerRegistry,
  SchedulerOrchestrator,
};
