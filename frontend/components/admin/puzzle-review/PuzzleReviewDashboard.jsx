'use client';

import { useState } from 'react';
import { usePuzzleReviews } from '../../../hooks/usePuzzleReviews';
import ReviewStats from './ReviewStats';
import ReviewFilters from './ReviewFilters';
import ReviewTable from './ReviewTable';
import BulkActions from './BulkActions';
import ReviewDetailModal from './ReviewDetailModal';
import { Alert, AlertDescription } from '../../ui/alert';

// PuzzleReviewDashboard is the top-level page/container for moderating
// puzzle submissions. It wires together stats, filters, the reviews table,
// bulk actions, and a detail modal, and owns all of the local UI state
// (selection, modal visibility, loading, and transient notifications).
// Data fetching and mutation logic itself lives in the usePuzzleReviews hook;
// this component is mostly responsible for orchestrating UI state around it.
const PuzzleReviewDashboard = () => {
  const {
    reviews,           // current page of review items to display
    loading,           // true while reviews are being fetched
    error,             // error message from fetching reviews, if any
    pagination,        // current pagination state (page, page size, total, etc.)
    filters,           // current filter selections applied to the review list
    stats,             // aggregate stats (counts by status, etc.) for the stats panel
    statsLoading,       // true while stats are being fetched
    updateFilters,      // setter to change filters (triggers a refetch)
    updatePagination,   // setter to change page/page size (triggers a refetch)
    approveReview,      // approves a single review by id
    rejectReview,       // rejects a single review by id
    bulkApproveReviews, // approves multiple reviews at once
    bulkRejectReviews,  // rejects multiple reviews at once
  } = usePuzzleReviews();

  // IDs of reviews currently checked in the table, used for bulk actions
  const [selectedReviews, setSelectedReviews] = useState([]);
  // The review currently shown in the detail modal (null when none is open)
  const [selectedReview, setSelectedReview] = useState(null);
  // Controls visibility of the review detail modal
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  // True while an approve/reject action (single or bulk) is in flight;
  // used to disable buttons and show loading state across child components
  const [actionLoading, setActionLoading] = useState(false);
  // Transient success/error banner shown after an action completes;
  // shape: { type: 'success' | 'error', message: string } or null
  const [notification, setNotification] = useState(null);

  // Adds or removes a single review's id from the selection set,
  // depending on whether its checkbox was checked or unchecked.
  const handleReviewSelection = (reviewId, isSelected) => {
    if (isSelected) {
      setSelectedReviews(prev => [...prev, reviewId]);
    } else {
      setSelectedReviews(prev => prev.filter(id => id !== reviewId));
    }
  };

  // Selects or clears all reviews on the current page via the "select all" checkbox.
  const handleSelectAll = (isSelected) => {
    if (isSelected) {
      setSelectedReviews(reviews.map(review => review.id));
    } else {
      setSelectedReviews([]);
    }
  };

  // Approves a single review, shows a success/error notification based on
  // the result, and clears the notification after a short delay.
  const handleApproveReview = async (reviewId, reason = '') => {
    setActionLoading(true);
    try {
      const result = await approveReview(reviewId, reason);
      setNotification({
        type: result.success ? 'success' : 'error',
        message: result.message,
      });
    } catch (error) {
      // Catches unexpected errors (e.g. network failures) not represented
      // in the hook's own result.success/message contract
      setNotification({
        type: 'error',
        message: 'Failed to approve review',
      });
    } finally {
      setActionLoading(false);
      // Auto-dismiss the notification after 3 seconds
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // Rejects a single review; mirrors handleApproveReview's flow and notification handling.
  const handleRejectReview = async (reviewId, reason = '') => {
    setActionLoading(true);
    try {
      const result = await rejectReview(reviewId, reason);
      setNotification({
        type: result.success ? 'success' : 'error',
        message: result.message,
      });
    } catch (error) {
      setNotification({
        type: 'error',
        message: 'Failed to reject review',
      });
    } finally {
      setActionLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // Approves every currently-selected review in one bulk call.
  // No-ops if nothing is selected. Clears the selection on completion
  // so the BulkActions bar disappears afterwards.
  const handleBulkApprove = async (reason = '') => {
    if (selectedReviews.length === 0) return;
    
    setActionLoading(true);
    try {
      const result = await bulkApproveReviews(selectedReviews, reason);
      setNotification({
        type: result.success ? 'success' : 'error',
        message: result.message,
      });
      setSelectedReviews([]);
    } catch (error) {
      setNotification({
        type: 'error',
        message: 'Failed to approve reviews',
      });
    } finally {
      setActionLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // Rejects every currently-selected review in one bulk call.
  // Mirrors handleBulkApprove's guard clause, loading state, and cleanup.
  const handleBulkReject = async (reason = '') => {
    if (selectedReviews.length === 0) return;
    
    setActionLoading(true);
    try {
      const result = await bulkRejectReviews(selectedReviews, reason);
      setNotification({
        type: result.success ? 'success' : 'error',
        message: result.message,
      });
      setSelectedReviews([]);
    } catch (error) {
      setNotification({
        type: 'error',
        message: 'Failed to reject reviews',
      });
    } finally {
      setActionLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // Opens the detail modal for a specific review (e.g. when a row is clicked).
  const handleViewReview = (review) => {
    setSelectedReview(review);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Transient success/error banner for the most recent action */}
      {notification && (
        <Alert className={notification.type === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          <AlertDescription className={notification.type === 'success' ? 'text-green-800' : 'text-red-800'}>
            {notification.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Aggregate stats panel (counts by status, etc.) */}
      <ReviewStats stats={stats} loading={statsLoading} />

      {/* Filter controls for narrowing down the reviews list */}
      <ReviewFilters 
        filters={filters}
        onFiltersChange={updateFilters}
        disabled={loading}
      />

      {/* Bulk action bar, only shown once at least one review is selected */}
      {selectedReviews.length > 0 && (
        <BulkActions
          selectedCount={selectedReviews.length}
          onApprove={handleBulkApprove}
          onReject={handleBulkReject}
          loading={actionLoading}
        />
      )}

      {/* Error banner for failures fetching the review list itself */}
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Main table of reviews, including per-row actions and pagination */}
      <ReviewTable
        reviews={reviews}
        loading={loading}
        pagination={pagination}
        selectedReviews={selectedReviews}
        onSelectionChange={handleReviewSelection}
        onSelectAll={handleSelectAll}
        onApprove={handleApproveReview}
        onReject={handleRejectReview}
        onViewDetail={handleViewReview}
        onPaginationChange={updatePagination}
        actionLoading={actionLoading}
      />

      {/* Detail modal for inspecting/acting on a single review; only
          rendered once a review has been selected for viewing */}
      {selectedReview && (
        <ReviewDetailModal
          review={selectedReview}
          open={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedReview(null);
          }}
          onApprove={handleApproveReview}
          onReject={handleRejectReview}
          loading={actionLoading}
        />
      )}
    </div>
  );
};

export default PuzzleReviewDashboard;