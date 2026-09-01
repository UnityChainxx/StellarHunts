import { AnalyticsRollupService } from './analytic-rollup.service';

describe('AnalyticsRollupService', () => {
  const pool = { query: jest.fn() };
  let service: AnalyticsRollupService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    service = new AnalyticsRollupService(pool as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries a failed scheduled refresh with exponential backoff', async () => {
    pool.query
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({});

    const refresh = service.refreshForTesting('scheduled', true);
    await jest.advanceTimersByTimeAsync(500);
    await jest.advanceTimersByTimeAsync(1000);
    await refresh;

    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query).toHaveBeenLastCalledWith(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY puzzle_stats_mv',
    );
  });

  it('skips overlapping scheduled refreshes', async () => {
    let resolveQuery!: () => void;
    pool.query.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveQuery = resolve;
    }));

    const first = service.refreshLeaderboard();
    const second = service.refreshLeaderboard();
    resolveQuery();

    await Promise.all([first, second]);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('contains startup failures after exhausting retries', async () => {
    pool.query.mockRejectedValue(new Error('database unavailable'));

    const refresh = service.onModuleInit();
    await jest.advanceTimersByTimeAsync(500);
    await jest.advanceTimersByTimeAsync(1000);
    await refresh;

    expect(pool.query).toHaveBeenCalledTimes(3);
  });
});
