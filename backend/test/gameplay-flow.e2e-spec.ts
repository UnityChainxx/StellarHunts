import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PuzzleModule } from '../src/puzzle/puzzle.module';
import { Puzzle } from '../src/puzzle/puzzle.entity';
import { PuzzleSubmissionModule } from '../src/puzzle-submission/puzzle-submission.module';
import { PuzzleSubmission } from '../src/puzzle-submission/puzzle-submission.entity';
import { ProgressModule } from '../src/progress/progress.module';
import { Progress } from '../src/progress/entities/progress.entity';
import { StreakModule } from '../src/streak/streak.module';
import { Streak } from '../src/streak/entities/streak.entity';
import { StreakActivity } from '../src/streak/entities/streak-activity.entity';
import { UserRankingModule } from '../src/user-ranking/user-ranking.module';
import { UserRank } from '../src/user-ranking/entities/user-ranking.entity';
import { RewardsModule } from '../src/reward/reward.module';
import { Reward } from '../src/reward/entities/reward.entity';
import { RewardClaim } from '../src/reward/entities/reward-claim.entity';

/**
 * End-to-end coverage for the core gameplay loop:
 *
 *   puzzle discovery -> submission -> progress -> streaks/XP ->
 *   leaderboard -> reward eligibility
 *
 * including failure recovery (wrong answers, retried requests) and
 * duplicate-claim prevention. Requires a reachable PostgreSQL; connection
 * settings come from DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE
 * (see backend/.env.example).
 */
describe('Core gameplay flow (e2e)', () => {
  let app: INestApplication;
  let moduleFixture: TestingModule;

  const uniqueId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env.test'],
        }),
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            type: 'postgres',
            host: configService.get('DB_HOST') || 'localhost',
            port: configService.get('DB_PORT') || 5432,
            username: configService.get('DB_USERNAME') || 'test',
            password: configService.get('DB_PASSWORD') || 'test',
            database: configService.get('DB_DATABASE') || 'test_db',
            entities: [
              Puzzle,
              PuzzleSubmission,
              Progress,
              Streak,
              StreakActivity,
              UserRank,
              Reward,
              RewardClaim,
            ],
            synchronize: true,
            dropSchema: true,
          }),
        }),
        PuzzleModule,
        PuzzleSubmissionModule,
        ProgressModule,
        StreakModule,
        UserRankingModule,
        RewardsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('puzzle discovery', () => {
    it('publishes a puzzle and exposes it (without the solution) through the discovery endpoint', async () => {
      const title = uniqueId('puzzle');
      const createResponse = await request(app.getHttpServer())
        .post('/admin/puzzles')
        .send({
          title,
          description: 'An easy puzzle for the e2e flow',
          difficulty: 'easy',
          hint: 'Look closely',
          solution: 'orbit',
          isActive: true,
        })
        .expect(201);

      const puzzleId = createResponse.body.id;
      expect(puzzleId).toBeDefined();

      const listResponse = await request(app.getHttpServer())
        .get('/puzzles/active?difficulty=easy')
        .expect(200);

      const found = listResponse.body.find((p: any) => p.id === puzzleId);
      expect(found).toBeDefined();
      expect(found.title).toBe(title);
      expect(found.solution).toBeUndefined();
      expect(found.hint).toBeUndefined();
    });

    it('excludes inactive puzzles from discovery', async () => {
      const title = uniqueId('draft');
      const createResponse = await request(app.getHttpServer())
        .post('/admin/puzzles')
        .send({
          title,
          description: 'Not yet published',
          difficulty: 'hard',
          solution: 'secret',
          isActive: false,
        })
        .expect(201);

      const listResponse = await request(app.getHttpServer())
        .get('/puzzles/active')
        .expect(200);

      expect(listResponse.body.some((p: any) => p.id === createResponse.body.id)).toBe(
        false,
      );
    });
  });

  describe('puzzle submission and failure recovery', () => {
    it('records failed attempts and accepts the correct answer on a later try', async () => {
      const playerId = uniqueId('player');
      const puzzleId = uniqueId('puzzle');
      const correctAnswer = 'orbit';

      const first = await request(app.getHttpServer())
        .post('/puzzle-submission')
        .send({ playerId, puzzleId, answer: 'wrong-answer', correctAnswer })
        .expect(201);

      expect(first.body).toMatchObject({ isCorrect: false, attempts: 1 });

      const second = await request(app.getHttpServer())
        .post('/puzzle-submission')
        .send({ playerId, puzzleId, answer: 'still-wrong', correctAnswer })
        .expect(201);

      expect(second.body).toMatchObject({ isCorrect: false, attempts: 2 });

      const third = await request(app.getHttpServer())
        .post('/puzzle-submission')
        .send({ playerId, puzzleId, answer: correctAnswer, correctAnswer })
        .expect(201);

      expect(third.body).toMatchObject({ isCorrect: true, attempts: 3 });
    });
  });

  describe('progress tracking', () => {
    it('returns aggregate progress for a user', async () => {
      const userId = randomUUID();
      const progressRepository = moduleFixture.get('ProgressRepository');
      await progressRepository.save({
        userId,
        completedPuzzles: 1,
        totalPuzzles: 4,
      });

      const response = await request(app.getHttpServer())
        .get(`/users/${userId}/progress`)
        .expect(200);

      expect(response.body).toMatchObject({
        userId,
        completedPuzzles: 1,
        totalPuzzles: 4,
        percentComplete: 25,
      });
    });

    it('returns 404 for a user without progress', async () => {
      const userId = randomUUID();
      await request(app.getHttpServer())
        .get(`/users/${userId}/progress`)
        .expect(404);
    });
  });

  describe('streaks and leaderboard', () => {
    it('records activity, builds a streak, and keeps it stable on retries', async () => {
      const first = await request(app.getHttpServer())
        .post('/streaks/activity')
        .send({ activityType: 'login' })
        .expect(201);

      expect(first.body.currentStreak).toBe(1);
      expect(first.body.isActive).toBe(true);

      // A retried POST for the same day + activity type must be idempotent:
      // the streak must not inflate and no duplicate activity row is created.
      const retry = await request(app.getHttpServer())
        .post('/streaks/activity')
        .send({ activityType: 'login' })
        .expect(201);

      expect(retry.body.currentStreak).toBe(1);
      expect(retry.body.totalActiveDays).toBe(1);
    });

    it('reflects active users on the streak leaderboard', async () => {
      await request(app.getHttpServer())
        .post('/streaks/activity')
        .send({ activityType: 'task_completed' })
        .expect(201);

      const leaderboard = await request(app.getHttpServer())
        .get('/streaks/leaderboard?limit=10')
        .expect(200);

      expect(leaderboard.body.some((entry: any) => entry.currentStreak >= 1)).toBe(
        true,
      );
    });
  });

  describe('reward eligibility', () => {
    it('creates a reward and allows a single claim per user', async () => {
      const challengeId = uniqueId('challenge');
      const userId = uniqueId('user');

      const createResponse = await request(app.getHttpServer())
        .post('/reward')
        .send({
          name: 'StellarHunts E2E Badge',
          description: 'Awarded by the e2e suite',
          type: 'badge',
          metadata: { imageUrl: 'https://example.com/badge.png', rarity: 'common' },
          challengeId,
          isActive: true,
          maxClaims: 5,
        })
        .expect(201);

      expect(createResponse.body.challengeId).toBe(challengeId);

      const byChallenge = await request(app.getHttpServer())
        .get(`/reward/challenge/${challengeId}`)
        .expect(200);
      expect(byChallenge.body.isActive).toBe(true);

      const claim = await request(app.getHttpServer())
        .post('/reward/claim')
        .send({ userId, challengeId })
        .expect(201);

      expect(claim.body).toMatchObject({
        userId,
        challengeId,
        status: 'claimed',
      });

      // Duplicate claims are rejected so a retried request cannot double-award.
      await request(app.getHttpServer())
        .post('/reward/claim')
        .send({ userId, challengeId })
        .expect(409);

      const claims = await request(app.getHttpServer())
        .get(`/reward/user/${userId}/claims`)
        .expect(200);

      expect(claims.body).toHaveLength(1);
    });

    it('rejects claims for rewards that do not exist', async () => {
      const userId = uniqueId('user');
      await request(app.getHttpServer())
        .post('/reward/claim')
        .send({ userId, challengeId: uniqueId('missing') })
        .expect(404);
    });
  });
});
