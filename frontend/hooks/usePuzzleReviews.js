import { useState, useCallback } from 'react';
import {
  usePuzzleReviewsQuery,
  useReviewStatsQuery,
  useApproveReviewMutation,
  useRejectReviewMutation,
  useBulkApproveReviewsMutation,
  useBulkRejectReviewsMutation,
} from '../services/puzzleReviewHooks';

/**
 * Thin glue hook — wraps TanStack Query hooks for the puzzle review dashboard.
 * The page component uses this hook so it doesn't need useState/useCallback itself.
 */
export const usePuzzleReviews = () => {
  const [filters, setFilters] = useState({
    status: 'PENDING',
    sortBy: 'createdAt',
    sortOrder: 'DESC',
  });
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const queryFilters = { ...filters, page, limit };

  const {
    data: queryData,
    isLoading: loading,
    error: queryError,
  } = usePuzzleReviewsQuery(queryFilters);

  const {
    data: stats,
    isLoading: statsLoading,
  } = useReviewStatsQuery();

  const approveReviewMutation = useApproveReviewMutation();
  const rejectReviewMutation = useRejectReviewMutation();
  const bulkApproveMutation = useBulkApproveReviewsMutation();
  const bulkRejectMutation = useBulkRejectReviewsMutation();

  const error = queryError?.message || null;

  const reviews = queryData?.reviews ?? [];
  const pagination = {
    page,
    limit,
    total: queryData?.total ?? 0,
    totalPages: queryData?.totalPages ?? 0,
  };

  const updateFilters = useCallback((newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(1);
  }, []);

  const updatePagination = useCallback((newPagination) => {
    if (newPagination.page) setPage(newPagination.page);
  }, []);

  const approveReview = useCallback(
    async (reviewId, moderationReason = '') => {
      try {
        await approveReviewMutation.mutateAsync({ reviewId, moderationReason });
        return { success: true, message: 'Review approved successfully' };
      } catch (err) {
        return { success: false, message: err.message };
      }
    },
    [approveReviewMutation],
  );

  const rejectReview = useCallback(
    async (reviewId, moderationReason = '') => {
      try {
        await rejectReviewMutation.mutateAsync({ reviewId, moderationReason });
        return { success: true, message: 'Review rejected successfully' };
      } catch (err) {
        return { success: false, message: err.message };
      }
    },
    [rejectReviewMutation],
  );

  const bulkApproveReviews = useCallback(
    async (reviewIds, moderationReason = '') => {
      try {
        await bulkApproveMutation.mutateAsync({ reviewIds, moderationReason });
        return { success: true, message: `${reviewIds.length} reviews approved successfully` };
      } catch (err) {
        return { success: false, message: err.message };
      }
    },
    [bulkApproveMutation],
  );

  const bulkRejectReviews = useCallback(
    async (reviewIds, moderationReason = '') => {
      try {
        await bulkRejectMutation.mutateAsync({ reviewIds, moderationReason });
        return { success: true, message: `${reviewIds.length} reviews rejected successfully` };
      } catch (err) {
        return { success: false, message: err.message };
      }
    },
    [bulkRejectMutation],
  );

  return {
    // State
    reviews,
    loading,
    error,
    pagination,
    filters,
    stats,
    statsLoading,

    // Actions
    updateFilters,
    updatePagination,
    approveReview,
    rejectReview,
    bulkApproveReviews,
    bulkRejectReviews,
  };
};
