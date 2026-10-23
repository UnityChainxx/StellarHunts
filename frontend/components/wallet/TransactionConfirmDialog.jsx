"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Shows the human-readable summary of a transaction produced by
 * `summarizeTransaction` before anything is signed (issue #782).
 *
 * Use it as the `confirm` callback of `signWithConfirmation`:
 *
 *   <TransactionConfirmDialog
 *     open={open}
 *     summary={summary}
 *     onConfirm={() => resolve(true)}
 *     onReject={() => resolve(false)}
 *   />
 *
 * The dialog can only be dismissed via the explicit Confirm / Reject buttons —
 * there is no silent "OK" path, matching the no-blind-signing policy.
 */
const TransactionConfirmDialog = ({
  open,
  summary,
  onConfirm,
  onReject,
}) => {
  const [reviewed, setReviewed] = useState(false);

  const lines = summary?.human ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onReject?.()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Review transaction</DialogTitle>
          <DialogDescription>
            This is exactly what you are about to sign. Nothing is signed until
            you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 font-mono text-sm text-white/90 bg-white/5 border border-white/10 rounded-lg p-3 max-h-64 overflow-auto">
          {lines.length === 0 ? (
            <p className="text-red-300">
              This transaction could not be decoded into a readable summary and
              will not be signed.
            </p>
          ) : (
            lines.map((line, index) => (
              <p key={index} className="break-words">
                {line}
              </p>
            ))
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(event) => setReviewed(event.target.checked)}
            className="h-4 w-4 accent-purple-500"
          />
          I have read the summary above
        </label>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onReject?.()}>
            Reject
          </Button>
          <Button
            onClick={() => onConfirm?.()}
            disabled={!reviewed || lines.length === 0}
          >
            Confirm &amp; sign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionConfirmDialog;
