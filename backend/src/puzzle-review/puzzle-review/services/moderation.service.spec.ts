import { NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../../../audit-log/audit-log.service';
import { ModerationService } from './moderation.service';
import { ReviewStatus } from '../entities/puzzle-review.entity';
import { ModerationAction, ModerationReason } from '../entities/review-moderation.entity';

describe('ModerationService', () => {
  const buildRepo = (overrides: Record<string, jest.Mock> = {}) => ({
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn(() => buildQueryBuilder()),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    ...overrides,
  });

  const buildQueryBuilder = () => {
    const qb: any = {};
    for (const method of ['select', 'addSelect', 'where', 'groupBy', 'getRawMany']) {
      qb[method] = jest.fn(() => qb);
    }
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    return qb;
  };

  const setup = () => {
    const reviewRepository = buildRepo();
    const moderationRepository = buildRepo();
    const auditLogService = {
      createLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;
    const service = new ModerationService(
      reviewRepository as never,
      moderationRepository as never,
      auditLogService,
    );
    return { service, reviewRepository, moderationRepository, auditLogService };
  };

  it('writes an immutable audit record for every moderation action', async () => {
    const { service, reviewRepository, moderationRepository, auditLogService } =
      setup();
    const review = {
      id: 'review-1',
      status: ReviewStatus.APPROVED,
      reviewText: 'ok',
      rating: 4,
      moderationInfo: {},
    };
    reviewRepository.findOne.mockResolvedValue(review);
    reviewRepository.save.mockImplementation(async (r: any) => r);
    moderationRepository.create.mockReturnValue({ id: 'mod-1' });
    moderationRepository.save.mockResolvedValue({ id: 'mod-1' });

    const result = await service.moderateReview({
      reviewId: 'review-1',
      action: ModerationAction.FLAG,
      reason: ModerationReason.SPAM,
      moderatorId: 'admin-1',
    });

    expect(result.newStatus).toBe(ReviewStatus.FLAGGED);
    expect(auditLogService.createLog).toHaveBeenCalledWith(
      'admin-1',
      'moderation.flag',
      expect.objectContaining({
        reviewId: 'review-1',
        previousStatus: ReviewStatus.APPROVED,
        newStatus: ReviewStatus.FLAGGED,
        reason: ModerationReason.SPAM,
      }),
    );
  });

  it('returns a moderation record with the previous state for delete actions', async () => {
    const { service, reviewRepository, moderationRepository } = setup();
    const review = {
      id: 'review-1',
      status: ReviewStatus.FLAGGED,
      reviewText: 'to remove',
      rating: 1,
      moderationInfo: {},
    };
    reviewRepository.findOne.mockResolvedValue(review);
    reviewRepository.save.mockImplementation(async (r: any) => r);
    moderationRepository.create.mockReturnValue({ id: 'mod-2' });
    moderationRepository.save.mockResolvedValue({ id: 'mod-2' });

    const result = await service.moderateReview({
      reviewId: 'review-1',
      action: ModerationAction.DELETE,
      moderatorId: 'admin-1',
    });

    expect(result.newStatus).toBe(ReviewStatus.DELETED);
    expect(moderationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ModerationAction.DELETE,
        previousData: expect.objectContaining({ status: ReviewStatus.FLAGGED }),
      }),
    );
  });

  it('throws NotFound for a missing review', async () => {
    const { service, reviewRepository } = setup();
    reviewRepository.findOne.mockResolvedValue(null);

    await expect(
      service.moderateReview({
        reviewId: 'missing',
        action: ModerationAction.APPROVE,
        moderatorId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
