-- Migration: create-analytics-events
-- Run this with whatever migration runner the project already uses
-- (node-pg-migrate / TypeORM / plain psql). It is idempotent (IF NOT
-- EXISTS everywhere) so it's safe to re-run.
--
-- Replaces the in-memory Map<string, PuzzleStats> / Map<string, Map<...>>
-- in AnalyticsService. Postgres is now the single source of truth, so
-- data survives restarts and every NestJS replica reading from the same
-- database sees identical totals.

BEGIN;

CREATE TABLE IF NOT EXISTS analytics_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  puzzle_id   TEXT NOT NULL,
  solve_time  INTEGER NOT NULL CHECK (solve_time >= 0),
  solved_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backs getAverageSolveTimeAsync (single puzzle, live aggregate)
CREATE INDEX IF NOT EXISTS idx_analytics_events_puzzle_id
  ON analytics_events (puzzle_id);

-- Backs getUserPuzzleStatsAsync (single user, live aggregate)
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_puzzle
  ON analytics_events (user_id, puzzle_id);

-- Backs getUserPuzzleHistoryPaginated (ORDER BY last_solved DESC per user)
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_solved_at
  ON analytics_events (user_id, solved_at DESC);

-- Global leaderboard is the one aggregation expensive enough (full table
-- scan across every puzzle) to justify a periodic rollup instead of a
-- live GROUP BY on every request. Refreshed on a schedule by
-- AnalyticsRollupService.
CREATE MATERIALIZED VIEW IF NOT EXISTS puzzle_stats_mv AS
SELECT
  puzzle_id,
  COUNT(*)::bigint                          AS solve_count,
  COUNT(*)::bigint                          AS attempts,
  COALESCE(SUM(solve_time), 0)::bigint      AS total_solve_time,
  MAX(solved_at)                            AS last_solved
FROM analytics_events
GROUP BY puzzle_id
WITH NO DATA;

-- REFRESH MATERIALIZED VIEW CONCURRENTLY requires a unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_puzzle_stats_mv_puzzle_id
  ON puzzle_stats_mv (puzzle_id);

-- Initial populate. Required once before any CONCURRENTLY refresh can
-- run (a WITH NO DATA view can't be refreshed concurrently). The app
-- also does this defensively on boot in AnalyticsRollupService.
REFRESH MATERIALIZED VIEW puzzle_stats_mv;

COMMIT;