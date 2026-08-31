"use client";

import { useState, useCallback } from "react";
import puzzleReviewService from "../services/puzzleReviewService";
import { useApiQuery } from "./useApiQuery";
import { useApiMutation } from "./useApiMutation";

/**
 * Hook for managing puzzle review data with consistent loading / error / empty states.
 *
 * Built on the shared useApiQuery / useApiMutation wrappers so all requests get
 * automatic retry, cancellation, stale-data handling, and user-visible errors.
 */
export const usePuzzleReviews = () => {
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({
    status: "PENDING",
    sortBy: "createdAt",
    sortOrder: "DESC",
  });
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // ── Queries ──────────────────────────────────────────────────────────────

  const reviewsQuery = useApiQuery({
    key: ["reviews", filters, pagination.page, pagination.limit],
    fn: async ({ signal }) => {
      const response = await puzzleReviewService.getPuzzleReviews({
        ...filters,
        page: pagination.page,
        limit: pagination.limit,
      });
      if (!response.success) throw new Error(response.message || "Failed to fetch reviews");
      return response.data;
    },
    staleTime: 30_000,
  });

  const statsQuery = useApiQuery({
    key: ["reviewStats"],
    fn: async () => {
      const response = await puzzleReviewService.getReviewStats();
      if (!response.success) throw new Error(response.message || "Failed to fetch stats");
      return response.data;
    },
    staleTime: 60_000,
  });

  // ── Mutations ────────────────────────────────────────────────────────────

  const approveMutation = useApiMutation({
    fn: async ({ reviewId, moderationReason }) => {
      const response = await puzzleReviewService.updateReviewStatus(
        reviewId,
        "APPROVED",
        moderationReason,
      );
      if (!response.success) throw new Error(response.message);
      return response.data;
    },
    invalidate: ["reviews", "reviewStats"],
  });

  const rejectMutation = useApiMutation({
    fn: async ({ reviewId, moderationReason }) => {
      const response = await puzzleReviewService.updateReviewStatus(
        reviewId,
        "REJECTED",
        moderationReason,
      );
      if (!response.success) throw new Error(response.message);
      return response.data;
    },
    invalidate: ["reviews", "reviewStats"],
  });

  const bulkApproveMutation = useApiMutation({
    fn: async ({ reviewIds, moderationReason }) => {
      const response = await puzzleReviewService.bulkUpdateReviewStatuses(
        reviewIds,
        "APPROVED",
        moderationReason,
      );
      if (!response.success) throw new Error(response.message);
      return response.data;
    },
    invalidate: ["reviews", "reviewStats"],
  });

  const bulkRejectMutation = useApiMutation({
    fn: async ({ reviewIds, moderationReason }) => {
      const response = await puzzleReviewService.bulkUpdateReviewStatuses(
        reviewIds,
        "REJECTED",
        moderationReason,
      );
      if (!response.success) throw new Error(response.message);
      return response.data;
    },
    invalidate: ["reviews", "reviewStats"],
  });

  // ── Actions ──────────────────────────────────────────────────────────────

  const updateFilters = useCallback((newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const updatePagination = useCallback((newPagination) => {
    setPagination((prev) => ({ ...prev, ...newPagination }));
  }, []);

  const approveReview = useCallback(
    (reviewId, moderationReason = "") =>
      approveMutation.mutateAsync({ reviewId, moderationReason }),
    [approveMutation],
  );

  const rejectReview = useCallback(
    (reviewId, moderationReason = "") =>
      rejectMutation.mutateAsync({ reviewId, moderationReason }),
    [rejectMutation],
  );

  const bulkApproveReviews = useCallback(
    (reviewIds, moderationReason = "") =>
      bulkApproveMutation.mutateAsync({ reviewIds, moderationReason }),
    [bulkApproveMutation],
  );

  const bulkRejectReviews = useCallback(
    (reviewIds, moderationReason = "") =>
      bulkRejectMutation.mutateAsync({ reviewIds, moderationReason }),
    [bulkRejectMutation],
  );

  // ── Derived state ────────────────────────────────────────────────────────

  const reviews = reviewsQuery.data?.reviews ?? [];
  const stats = statsQuery.data ?? null;
  const loading = reviewsQuery.isLoading;
  const error = reviewsQuery.error;
  const statsLoading = statsQuery.isLoading;

  // Sync pagination totals from the last successful query
  if (reviewsQuery.data) {
    pagination.total = reviewsQuery.data.total;
    pagination.totalPages = reviewsQuery.data.totalPages;
  }

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
    fetchReviews: reviewsQuery.refetch,
    updateFilters,
    updatePagination,
    approveReview,
    rejectReview,
    bulkApproveReviews,
    bulkRejectReviews,
    fetchStats: statsQuery.refetch,
  };
};
