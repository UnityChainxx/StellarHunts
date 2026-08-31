"use client";

import { useCallback } from "react";
import axios from "axios";
import { useApiQuery } from "./useApiQuery";
import { useApiMutation } from "./useApiMutation";

/**
 * Hook for managing referral data with consistent loading / error / empty states.
 *
 * Built on the shared useApiQuery / useApiMutation wrappers so all requests get
 * automatic retry, cancellation, stale-data handling, and user-visible errors.
 */
export const useReferral = (userId) => {
  // ── Queries ──────────────────────────────────────────────────────────────

  const referralQuery = useApiQuery({
    key: ["referral", userId],
    fn: async ({ signal }) => {
      if (!userId) return null;
      const response = await axios.get(`/api/referrals/${userId}`, {
        withCredentials: true,
        signal,
      });
      return response.data;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  // ── Mutations ────────────────────────────────────────────────────────────

  const trackMutation = useApiMutation({
    fn: async ({ referrerId, newUserId }) => {
      await axios.post(
        "/api/referrals/track",
        { referrerId, newUserId },
        { withCredentials: true },
      );
    },
    invalidate: ["referral"],
  });

  // ── Actions ──────────────────────────────────────────────────────────────

  const fetchReferralData = useCallback(
    (id) => {
      if (id) referralQuery.refetch();
    },
    [referralQuery],
  );

  const trackReferral = useCallback(
    (referrerId, newUserId) =>
      trackMutation.mutateAsync({ referrerId, newUserId }),
    [trackMutation],
  );

  // ── Helpers ──────────────────────────────────────────────────────────────

  const generateReferralLink = useCallback((id) => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://nft-hunt.com";
    return `${baseUrl}/ref/${id}`;
  }, []);

  const getRewardTier = useCallback((totalInvites) => {
    if (totalInvites >= 50) return { tier: "Mythic", reward: "Mythic NFT", color: "pink" };
    if (totalInvites >= 25) return { tier: "Legendary", reward: "Legendary NFT", color: "yellow" };
    if (totalInvites >= 10) return { tier: "Epic", reward: "Epic NFT", color: "purple" };
    if (totalInvites >= 5) return { tier: "Rare", reward: "Rare NFT", color: "green" };
    return { tier: "Common", reward: "Common NFT", color: "gray" };
  }, []);

  const getProgressToNextMilestone = useCallback((currentInvites) => {
    const milestones = [5, 10, 25, 50];
    const nextMilestone = milestones.find((m) => m > currentInvites) || 50;
    const progress = (currentInvites / nextMilestone) * 100;
    return {
      current: currentInvites,
      next: nextMilestone,
      progress: Math.min(progress, 100),
      remaining: nextMilestone - currentInvites,
    };
  }, []);

  const shareReferral = useCallback(async (referralLink) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join StellarHunt!",
          text: "I'm playing this amazing StellarHunt game. Join me and earn exclusive rewards!",
          url: referralLink,
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  const copyReferralLink = useCallback(async (referralLink) => {
    try {
      await navigator.clipboard.writeText(referralLink);
      return true;
    } catch {
      return false;
    }
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────

  const data = referralQuery.data;
  const referralStats = data?.stats ?? {
    totalInvites: 0,
    activeUsers: 0,
    totalRewards: 0,
    totalXPEarned: 0,
    nextMilestone: "",
  };
  const invitedUsers = data?.invitedUsers ?? [];

  return {
    referralStats,
    invitedUsers,
    loading: referralQuery.isLoading,
    error: referralQuery.error,
    generateReferralLink,
    fetchReferralData,
    trackReferral,
    getRewardTier,
    getProgressToNextMilestone,
    shareReferral,
    copyReferralLink,
  };
};
