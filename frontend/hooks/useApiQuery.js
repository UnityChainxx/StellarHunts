"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Shared query hook with sensible defaults for the StellarHunt frontend.
 *
 * Features:
 *  - Automatic retry with exponential backoff (3 attempts)
 *  - Query-key based caching with stale-data revalidation
 *  - Abort/cancellation support via React Query internals
 *  - Configurable stale-time and refetch behaviour
 *
 * @param {Object} options
 * @param {string[]} options.key       – Query key (unique identifier)
 * @param {Function}  options.fn       – Async function that returns data
 * @param {number}    [options.staleTime=60_000]   – Ms before data is considered stale
 * @param {number}    [options.gcTime=300_000]     – Ms before inactive cache is garbage-collected
 * @param {boolean}   [options.enabled=true]        – Whether the query should run
 * @param {number}    [options.retry=3]             – Number of retries
 * @param {number}    [options.retryDelay]          – Custom retry delay (ms); defaults to exponential
 * @param {Object}    [options.queryOptions]        – Extra options forwarded to useQuery
 *
 * @returns {import("@tanstack/react-query").UseQueryResult}
 */
export function useApiQuery({
  key,
  fn,
  staleTime = 60_000,
  gcTime = 300_000,
  enabled = true,
  retry = 3,
  retryDelay,
  ...queryOptions
}) {
  return useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      // Pass the AbortSignal so the caller can cancel via Axios / fetch
      return fn({ signal });
    },
    staleTime,
    gcTime,
    enabled,
    retry,
    retryDelay: retryDelay ?? ((attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000)),
    refetchOnWindowFocus: false,
    ...queryOptions,
  });
}

/**
 * Convenience hook to invalidate (refetch) queries by key prefix.
 *
 * Usage:
 *   const { invalidateQueries } = useInvalidateQueries();
 *   await invalidateQueries(["reviews"]);
 */
export function useInvalidateQueries() {
  const queryClient = useQueryClient();

  return {
    invalidateQueries: (keyPrefix) =>
      queryClient.invalidateQueries({
        queryKey: Array.isArray(keyPrefix) ? keyPrefix : [keyPrefix],
      }),
  };
}

export default useApiQuery;
