"use client";

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Shared mutation hook with consistent error handling and cache invalidation.
 *
 * Features:
 *  - Automatic retry (configurable)
 *  - Query invalidation after successful mutation
 *  - User-facing error message extraction
 *  - Loading / error / data state tracking
 *  - Optional optimistic update support
 *
 * @param {Object} options
 * @param {Function}  options.fn            – Async mutation function
 * @param {string[]}  [options.invalidate]  – Query key prefix to invalidate on success
 * @param {Function}  [options.onSuccess]   – Additional callback after success
 * @param {Function}  [options.onError]     – Additional callback after error
 * @param {number}    [options.retry=1]     – Number of retries
 * @param {Object}    [options.mutationOptions] – Extra options forwarded to useMutation
 *
 * @returns {{ mutate, mutateAsync, isLoading, error, data, reset }}
 */
export function useApiMutation({
  fn,
  invalidate,
  onSuccess,
  onError,
  retry = 1,
  ...mutationOptions
}) {
  const queryClient = useQueryClient();
  const [userError, setUserError] = useState(null);

  const mutation = useMutation({
    mutationFn: async (variables) => {
      setUserError(null);
      return fn(variables);
    },
    retry,
    onSuccess: async (data, variables, context) => {
      // Invalidate related queries so they refetch
      if (invalidate) {
        const keys = Array.isArray(invalidate) ? invalidate : [invalidate];
        for (const key of keys) {
          await queryClient.invalidateQueries({ queryKey: [key] });
        }
      }
      onSuccess?.(data, variables, context);
    },
    onError: (error, variables, context) => {
      const message = extractErrorMessage(error);
      setUserError(message);
      onError?.(error, variables, context);
    },
    ...mutationOptions,
  });

  const reset = useCallback(() => {
    setUserError(null);
    mutation.reset();
  }, [mutation]);

  return {
    ...mutation,
    userError,
    reset,
  };
}

/**
 * Extract a human-readable error message from various error shapes.
 */
function extractErrorMessage(error) {
  if (typeof error === "string") return error;
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.data?.error) return error.response.data.error;
  if (error?.message) return error.message;
  return "An unexpected error occurred. Please try again.";
}

export default useApiMutation;
