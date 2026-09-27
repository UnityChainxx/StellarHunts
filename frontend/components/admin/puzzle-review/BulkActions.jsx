import { useState } from 'react';
import { Check, X, AlertTriangle } from 'lucide-react';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../../ui/dialog';
import { Textarea } from '../../ui/textarea';

// BulkActions renders a toolbar for performing bulk moderation actions
// (approve/reject) on a set of currently selected reviews.
// Props:
//   - selectedCount: number of reviews currently selected
//   - onApprove: async callback invoked with an optional reason when the user confirms bulk approval
//   - onReject: async callback invoked with a required reason when the user confirms bulk rejection
//   - loading: boolean flag used to disable controls while an action is in flight
const BulkActions = ({ selectedCount, onApprove, onReject, loading }) => {
  // Controls visibility of the "Approve All" confirmation dialog
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  // Controls visibility of the "Reject All" confirmation dialog
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  // Shared text entered by the moderator, used as either the approval note
  // or the rejection reason depending on which dialog is open
  const [reason, setReason] = useState('');

  // Runs when the moderator confirms the bulk approval.
  // Calls the parent handler with the (optional) reason, then resets
  // local state and closes the dialog.
  const handleApprove = async () => {
    await onApprove(reason);
    setReason('');
    setIsApproveDialogOpen(false);
  };

  // Runs when the moderator confirms the bulk rejection.
  // Calls the parent handler with the (required) reason, then resets
  // local state and closes the dialog.
  const handleReject = async () => {
    await onReject(reason);
    setReason('');
    setIsRejectDialogOpen(false);
  };

  return (
    // Outer banner/container shown whenever one or more reviews are selected
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        {/* Left side: icon + summary text showing how many reviews are selected */}
        <div className="flex items-center space-x-3">
          <AlertTriangle className="h-5 w-5 text-blue-600" />
          <div>
            <p className="text-sm font-medium text-blue-900">
              {selectedCount} review{selectedCount !== 1 ? 's' : ''} selected
            </p>
            <p className="text-xs text-blue-700">
              Choose an action to perform on all selected reviews
            </p>
          </div>
        </div>

        {/* Right side: action buttons that open confirmation dialogs */}
        <div className="flex items-center space-x-2">
          {/* Bulk Approve */}
          <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
            {/* Trigger button that opens the approve confirmation dialog */}
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={loading}
              >
                <Check className="h-4 w-4 mr-2" />
                Approve All
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Approve {selectedCount} Review{selectedCount !== 1 ? 's' : ''}</DialogTitle>
                <DialogDescription>
                  Are you sure you want to approve all selected reviews? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  {/* Optional note explaining why the reviews are being approved */}
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Moderation Reason (Optional)
                  </label>
                  <Textarea
                    placeholder="Enter a reason for approval..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                {/* Cancel closes the dialog without performing any action */}
                <Button
                  variant="outline"
                  onClick={() => setIsApproveDialogOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                {/* Confirm triggers the bulk approve handler; disabled while loading */}
                <Button
                  onClick={handleApprove}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {loading ? 'Approving...' : `Approve ${selectedCount} Review${selectedCount !== 1 ? 's' : ''}`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Bulk Reject */}
          <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
            {/* Trigger button that opens the reject confirmation dialog */}
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-600 hover:bg-red-50"
                disabled={loading}
              >
                <X className="h-4 w-4 mr-2" />
                Reject All
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reject {selectedCount} Review{selectedCount !== 1 ? 's' : ''}</DialogTitle>
                <DialogDescription>
                  Are you sure you want to reject all selected reviews? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  {/* Rejection reason is required so callers always have context for the rejection */}
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rejection Reason (Required)
                  </label>
                  <Textarea
                    placeholder="Enter a reason for rejection..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                {/* Cancel closes the dialog without performing any action */}
                <Button
                  variant="outline"
                  onClick={() => setIsRejectDialogOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                {/* Confirm triggers the bulk reject handler; disabled while loading
                    or while the reason field is empty (reason is required) */}
                <Button
                  onClick={handleReject}
                  disabled={loading || !reason.trim()}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {loading ? 'Rejecting...' : `Reject ${selectedCount} Review${selectedCount !== 1 ? 's' : ''}`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
};

export default BulkActions;