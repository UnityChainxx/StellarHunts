import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import puzzleReviewService from './puzzleReviewService';

// ── Query keys ────────────────────────────────────────────────────────
export const puzzleReviewKeys = {
  all: ['puzzleReviews'],
  list: (filters) => ['puzzleReviews', 'list', filters],
  stats: () => ['puzzleReviews', 'stats'],
};

// ── Queries ───────────────────────────────────────────────────────────

/**
 * Fetch paginated puzzle reviews with filters.
 */
export const usePuzzleReviewsQuery = (filters) => {
  return useQuery({
    queryKey: puzzleReviewKeys.list(filters),
    queryFn: () => puzzleReviewService.getPuzzleReviews(filters),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
};

/**
 * Fetch review statistics.
 */
export const useReviewStatsQuery = () => {
  return useQuery({
    queryKey: puzzleReviewKeys.stats(),
    queryFn: () => puzzleReviewService.getReviewStats(),
    select: (response) => response.data,
    staleTime: 60_000,
  });
};

// ── Mutations ─────────────────────────────────────────────────────────

/**
 * Approve a single review.
 */
export const useApproveReviewMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reviewId, moderationReason = '' }) =>
      puzzleReviewService.updateReviewStatus(reviewId, 'APPROVED', moderationReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: puzzleReviewKeys.all });
    },
  });
};

/**
 * Reject a single review.
 */
export const useRejectReviewMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reviewId, moderationReason = '' }) =>
      puzzleReviewService.updateReviewStatus(reviewId, 'REJECTED', moderationReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: puzzleReviewKeys.all });
    },
  });
};

/**
 * Bulk-approve multiple reviews.
 */
export const useBulkApproveReviewsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reviewIds, moderationReason = '' }) =>
      puzzleReviewService.bulkUpdateReviewStatuses(reviewIds, 'APPROVED', moderationReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: puzzleReviewKeys.all });
    },
  });
};

/**
 * Bulk-reject multiple reviews.
 */
export const useBulkRejectReviewsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reviewIds, moderationReason = '' }) =>
      puzzleReviewService.bulkUpdateReviewStatuses(reviewIds, 'REJECTED', moderationReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: puzzleReviewKeys.all });
    },
  });
};
