// Only load mock data when the USE_MOCKS flag is explicitly enabled.
// In production, no mock data is bundled — the service returns empty defaults.
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

const mockReviews = USE_MOCKS
  ? [
      {
        id: '1',
        puzzleId: 'puzzle-001',
        userId: 'user-123',
        username: 'JohnDoe',
        rating: 5,
        reviewText:
          'This puzzle was absolutely fantastic! The clues were well-crafted and the difficulty was just right. I particularly enjoyed the creative use of QR codes and the way the story unfolded throughout the hunt.',
        reviewType: 'DETAILED',
        status: 'PENDING',
        isAnonymous: false,
        tags: ['engaging', 'creative', 'well-designed'],
        helpfulCount: 3,
        reportCount: 0,
        metadata: {
          difficulty: 'INTERMEDIATE',
          completionTime: 25,
        },
        moderationInfo: null,
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z',
      },
      {
        id: '2',
        puzzleId: 'puzzle-002',
        userId: 'user-456',
        username: 'JaneSmith',
        rating: 4,
        reviewText:
          'Great puzzle design! The hints were helpful without giving too much away. Would definitely recommend to others.',
        reviewType: 'TEXT_REVIEW',
        status: 'APPROVED',
        isAnonymous: false,
        tags: ['recommended', 'hints'],
        helpfulCount: 7,
        reportCount: 0,
        metadata: {
          difficulty: 'BEGINNER',
          completionTime: 15,
        },
        moderationInfo: {
          moderatedBy: 'admin@example.com',
          moderatedAt: '2024-01-16T09:15:00Z',
          moderationReason: 'Approved - appropriate content',
        },
        createdAt: '2024-01-14T14:20:00Z',
        updatedAt: '2024-01-16T09:15:00Z',
      },
      {
        id: '3',
        puzzleId: 'puzzle-003',
        userId: null,
        username: 'Anonymous',
        rating: 2,
        reviewText:
          'This puzzle was too difficult and the instructions were unclear. Not enjoyable at all.',
        reviewType: 'TEXT_REVIEW',
        status: 'REJECTED',
        isAnonymous: true,
        tags: ['difficult', 'unclear'],
        helpfulCount: 1,
        reportCount: 2,
        metadata: {
          difficulty: 'EXPERT',
          completionTime: 45,
        },
        moderationInfo: {
          moderatedBy: 'admin@example.com',
          moderatedAt: '2024-01-17T11:30:00Z',
          moderationReason: 'Rejected - inappropriate language',
        },
        createdAt: '2024-01-13T16:45:00Z',
        updatedAt: '2024-01-17T11:30:00Z',
      },
      {
        id: '4',
        puzzleId: 'puzzle-001',
        userId: 'user-789',
        username: 'PuzzleMaster',
        rating: 5,
        reviewText:
          'Excellent puzzle! The blockchain integration was seamless and educational. Loved learning about smart contracts while solving.',
        reviewType: 'DETAILED',
        status: 'PENDING',
        isAnonymous: false,
        tags: ['blockchain', 'educational', 'smart-contracts'],
        helpfulCount: 5,
        reportCount: 0,
        metadata: {
          difficulty: 'ADVANCED',
          completionTime: 35,
        },
        moderationInfo: null,
        createdAt: '2024-01-18T08:15:00Z',
        updatedAt: '2024-01-18T08:15:00Z',
      },
      {
        id: '5',
        puzzleId: 'puzzle-004',
        userId: 'user-101',
        username: 'CryptoEnthusiast',
        rating: 3,
        reviewText: 'Decent puzzle but could use more hints for beginners.',
        reviewType: 'RATING_ONLY',
        status: 'PENDING',
        isAnonymous: false,
        tags: ['beginner-friendly'],
        helpfulCount: 2,
        reportCount: 0,
        metadata: {
          difficulty: 'BEGINNER',
          completionTime: 20,
        },
        moderationInfo: null,
        createdAt: '2024-01-19T12:00:00Z',
        updatedAt: '2024-01-19T12:00:00Z',
      },
    ]
  : [];

const mockStats = USE_MOCKS
  ? {
      totalCount: 5,
      pendingCount: 3,
      approvedCount: 1,
      rejectedCount: 1,
      averageRating: 3.8,
      ratingDistribution: {
        1: 0,
        2: 1,
        3: 1,
        4: 1,
        5: 2,
      },
    }
  : {
      totalCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      averageRating: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };

class PuzzleReviewService {
  constructor() {
    this.reviews = [...mockReviews];
    this.stats = { ...mockStats };
  }

  // Simulate API delay
  async delay(ms = 500) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get all puzzle reviews with filtering and pagination
  async getPuzzleReviews(filters = {}) {
    await this.delay();
    
    let filteredReviews = [...this.reviews];
    
    // Apply filters
    if (filters.status) {
      filteredReviews = filteredReviews.filter(review => review.status === filters.status);
    }
    
    if (filters.rating) {
      filteredReviews = filteredReviews.filter(review => review.rating === parseInt(filters.rating));
    }
    
    if (filters.minRating) {
      filteredReviews = filteredReviews.filter(review => review.rating >= parseInt(filters.minRating));
    }
    
    if (filters.maxRating) {
      filteredReviews = filteredReviews.filter(review => review.rating <= parseInt(filters.maxRating));
    }
    
    if (filters.reviewType) {
      filteredReviews = filteredReviews.filter(review => review.reviewType === filters.reviewType);
    }
    
    // Apply sorting
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'DESC';
    
    filteredReviews.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      if (sortBy === 'createdAt' || sortBy === 'updatedAt') {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      }
      
      if (sortOrder === 'ASC') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    // Apply pagination
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedReviews = filteredReviews.slice(startIndex, endIndex);
    
    return {
      success: true,
      message: 'Reviews retrieved successfully',
      data: {
        reviews: paginatedReviews,
        total: filteredReviews.length,
        page: page,
        totalPages: Math.ceil(filteredReviews.length / limit)
      }
    };
  }

  // Get a specific review by ID
  async getReviewById(reviewId) {
    await this.delay();
    const review = this.reviews.find(r => r.id === reviewId);
    
    if (!review) {
      throw new Error('Review not found');
    }
    
    return {
      success: true,
      message: 'Review retrieved successfully',
      data: review
    };
  }

  // Synchronous mutation helper. Applies the status change in-place
  // without simulating the per-request API latency. Shared by
  // `updateReviewStatus` (single-item path, still awaits `delay()` to
  // match the original behaviour for individual calls) and the bulk
  // path so that bulk operations complete in <1ms instead of stacking
  // an extra `delay()` per item.
  _applyReviewStatusSync(reviewId, status, moderationReason = '') {
    const reviewIndex = this.reviews.findIndex(r => r.id === reviewId);
    if (reviewIndex === -1) {
      return null;
    }
    const review = this.reviews[reviewIndex];
    review.status = status;
    review.moderationInfo = {
      moderatedBy: 'admin@example.com',
      moderatedAt: new Date().toISOString(),
      moderationReason: moderationReason
    };
    review.updatedAt = new Date().toISOString();
    return review;
  }

  // Update review status (approve/reject)
  async updateReviewStatus(reviewId, status, moderationReason = '') {
    await this.delay();

    const review = this._applyReviewStatusSync(reviewId, status, moderationReason);
    if (!review) {
      throw new Error('Review not found');
    }

    // Update stats
    this.updateStats();

    return {
      success: true,
      message: `Review ${status.toLowerCase()} successfully`,
      data: review
    };
  }

  // Get review statistics
  async getReviewStats() {
    await this.delay();
    return {
      success: true,
      message: 'Review statistics retrieved successfully',
      data: this.stats
    };
  }

  // Get puzzle review summary
  async getPuzzleReviewSummary(puzzleId) {
    await this.delay();
    const puzzleReviews = this.reviews.filter(r => r.puzzleId === puzzleId);
    
    const summary = {
      puzzleId,
      totalReviews: puzzleReviews.length,
      averageRating: puzzleReviews.reduce((sum, r) => sum + r.rating, 0) / puzzleReviews.length,
      ratingDistribution: puzzleReviews.reduce((acc, r) => {
        acc[r.rating] = (acc[r.rating] || 0) + 1;
        return acc;
      }, {}),
      statusDistribution: puzzleReviews.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {})
    };
    
    return {
      success: true,
      message: 'Puzzle review summary retrieved successfully',
      data: summary
    };
  }

  // Report a review
  async reportReview(reviewId, reason) {
    await this.delay();
    
    const review = this.reviews.find(r => r.id === reviewId);
    if (!review) {
      throw new Error('Review not found');
    }
    
    review.reportCount += 1;
    review.updatedAt = new Date().toISOString();
    
    return {
      success: true,
      message: 'Review reported successfully',
      data: review
    };
  }

  // Bulk update review statuses. The bulk path represents a single
  // remote round-trip in production, not N independent ones, so we
  // intentionally do NOT await `this.delay()` here — doing so would
  // cause a 100-item request to take ~50s (500ms × 100). We also skip
  // the per-item `updateReviewStatus` call (which itself awaits
  // `delay()`) and instead use the synchronous helper directly. Stats
  // are recomputed once at the end. Unknown review IDs are surfaced in
  // the `skipped` array so callers can detect partial failures.
  async bulkUpdateReviewStatuses(reviewIds, status, moderationReason = '') {
    const updatedReviews = [];
    const skipped = [];
    for (const reviewId of reviewIds) {
      const review = this._applyReviewStatusSync(reviewId, status, moderationReason);
      if (review) {
        updatedReviews.push(review);
      } else {
        skipped.push(reviewId);
      }
    }

    if (updatedReviews.length > 0) {
      this.updateStats();
    }

    return {
      success: true,
      message: `${updatedReviews.length} reviews ${status.toLowerCase()} successfully`,
      data: updatedReviews,
      skipped,
    };
  }

  // Helper method to update statistics
  updateStats() {
    const total = this.reviews.length;
    const pending = this.reviews.filter(r => r.status === 'PENDING').length;
    const approved = this.reviews.filter(r => r.status === 'APPROVED').length;
    const rejected = this.reviews.filter(r => r.status === 'REJECTED').length;
    
    this.stats = {
      ...this.stats,
      totalCount: total,
      pendingCount: pending,
      approvedCount: approved,
      rejectedCount: rejected
    };
  }

  // Get reviews by status
  async getReviewsByStatus(status, page = 1, limit = 20) {
    return this.getPuzzleReviews({
      status,
      page,
      limit,
    });
  }

  // Get pending reviews
  async getPendingReviews(page = 1, limit = 20) {
    return this.getReviewsByStatus('PENDING', page, limit);
  }

  // Get approved reviews
  async getApprovedReviews(page = 1, limit = 20) {
    return this.getReviewsByStatus('APPROVED', page, limit);
  }

  // Get rejected reviews
  async getRejectedReviews(page = 1, limit = 20) {
    return this.getReviewsByStatus('REJECTED', page, limit);
  }
}

export default new PuzzleReviewService(); 