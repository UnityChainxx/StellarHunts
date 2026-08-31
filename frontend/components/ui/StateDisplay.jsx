"use client";

import LoadingSpinner from "./LoadingSpinner";
import { AlertCircle, Inbox, RefreshCw } from "lucide-react";

/**
 * Consistent loading state shown while API requests are in flight.
 */
export function LoadingState({ message = "Loading...", size = "md", className }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 ${className ?? ""}`}>
      <LoadingSpinner size={size} />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/**
 * Consistent error state with retry support.
 */
export function ErrorState({ error, onRetry, className }) {
  const message =
    typeof error === "string"
      ? error
      : error?.message || "Something went wrong. Please try again.";

  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-12 ${className ?? ""}`}>
      <div className="rounded-full bg-red-50 p-3 dark:bg-red-950">
        <AlertCircle className="h-6 w-6 text-red-500" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Error</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Consistent empty state when data returns an empty array / no results.
 */
export function EmptyState({ title = "Nothing here yet", description, icon: Icon, action, className }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-12 ${className ?? ""}`}>
      <div className="rounded-full bg-gray-100 p-3 dark:bg-gray-800">
        {Icon ? <Icon className="h-6 w-6 text-gray-400" /> : <Inbox className="h-6 w-6 text-gray-400" />}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/**
 * Composite component that picks the right state based on loading / error / data.
 *
 * Usage:
 *   <ApiStateDisplay
 *     isLoading={isLoading}
 *     error={error}
 *     data={items}
 *     onRetry={refetch}
 *     emptyTitle="No reviews"
 *     emptyDescription="There are no reviews to display."
 *   >
 *     {(items) => <ReviewList reviews={items} />}
 *   </ApiStateDisplay>
 */
export default function ApiStateDisplay({
  isLoading,
  error,
  data,
  onRetry,
  loadingMessage,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  emptyAction,
  children,
}) {
  if (isLoading) return <LoadingState message={loadingMessage} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  const isEmpty =
    data === null ||
    data === undefined ||
    (Array.isArray(data) && data.length === 0);

  if (isEmpty) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        icon={emptyIcon}
        action={emptyAction}
      />
    );
  }

  return typeof children === "function" ? children(data) : children;
}
