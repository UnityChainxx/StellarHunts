import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRank } from './entities/user-ranking.entity';
import { UserRankDto } from './dto/create-user-ranking.dto';
import { assertValidScore } from '../common/security/score-validation';

/**
 * Per-user leaderboard bounds. These cap what can ever be persisted, so an
 * "impossible" score (negative, non-finite, or absurdly large) is rejected
 * before it can be written (issue #364).
 */
const MAX_ACHIEVEMENTS = 100_000;
const MAX_ACTIVITY_POINTS = 1_000_000_000;
const MAX_SCORE = MAX_ACHIEVEMENTS * 100 + MAX_ACTIVITY_POINTS;

@Injectable()
export class UserRankingService {
  constructor(
    @InjectRepository(UserRank)
    private readonly userRankRepository: Repository<UserRank>,
  ) {}

  /**
   * Recompute a user's score and leaderboard rank.
   *
   * `metrics` must come from trusted, server-derived sources (achievement and
   * activity counters). Every value is validated before it is persisted —
   * this service never fabricates random scores (the previous `Math.random()`
   * stub has been removed).
   */
  async calculateAndUpdateRank(
    userId: string,
    metrics: { achievements?: number; activityPoints?: number } = {},
  ): Promise<UserRank> {
    const achievements = assertValidScore(metrics.achievements ?? 0, {
      field: 'achievements',
      max: MAX_ACHIEVEMENTS,
    });
    const activityPoints = assertValidScore(metrics.activityPoints ?? 0, {
      field: 'activityPoints',
      max: MAX_ACTIVITY_POINTS,
    });

    // Score is derived from the validated metrics only.
    const score = achievements * 100 + activityPoints;
    assertValidScore(score, { field: 'score', max: MAX_SCORE });

    let userRank = await this.userRankRepository.findOne({ where: { userId } });

    if (!userRank) {
      userRank = this.userRankRepository.create({
        userId,
        score,
        achievements,
        activityPoints,
      });
    } else {
      userRank.score = score;
      userRank.achievements = achievements;
      userRank.activityPoints = activityPoints;
    }

    userRank.lastUpdated = new Date();
    await this.userRankRepository.save(userRank);

    await this.recomputeAllRanks();

    return this.userRankRepository.findOneOrFail({ where: { userId } });
  }

  /**
   * Recompute rank positions for every ranked row in a single SQL statement
   * using a window function, instead of loading all rows into memory and
   * re-saving each one. This removes the N+1 write pattern and the
   * interleaving race that could leave a stale/inconsistent leaderboard
   * (issue #364).
   */
  private async recomputeAllRanks(): Promise<void> {
    await this.userRankRepository.query(
      `UPDATE "user_rank"
       SET "rank" = ranked.rn
       FROM (
         SELECT "id",
                ROW_NUMBER() OVER (
                  ORDER BY "score" DESC, "lastUpdated" ASC, "id" ASC
                ) AS rn
         FROM "user_rank"
       ) ranked
       WHERE "user_rank"."id" = ranked."id"`,
    );
  }

  async getUserRank(userId: string): Promise<UserRankDto> {
    const userRank = await this.userRankRepository.findOne({
      where: { userId },
    });

    if (!userRank) {
      // Reads never fabricate scores: return a zeroed row instead of writing
      // made-up values on a GET (issue #364).
      return {
        userId,
        score: 0,
        achievements: 0,
        activityPoints: 0,
        rank: 0,
      };
    }

    return {
      userId: userRank.userId,
      score: userRank.score,
      achievements: userRank.achievements,
      activityPoints: userRank.activityPoints,
      rank: userRank.rank,
    };
  }
}
