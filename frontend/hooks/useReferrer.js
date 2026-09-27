"use client";

import { apiClient } from "../lib/api";
import { useApiQuery } from "./useApiQuery";

/**
 * Loads the public profile of the user referenced by a referral link.
 *
 * Built on the shared query wrapper so the referral landing page gets
 * loading / error / empty states and a retry (`refetch`) for free.
 *
 * @param {string|undefined} referralId
 */
export function useReferrer(referralId) {
  return useApiQuery({
    key: ["referrer", referralId],
    fn: async ({ signal }) => {
      const response = await apiClient.get(`/referrals/${referralId}`, {
        signal,
      });
      return response.data;
    },
    enabled: Boolean(referralId),
    staleTime: 60_000,
  });
}

export default useReferrer;
