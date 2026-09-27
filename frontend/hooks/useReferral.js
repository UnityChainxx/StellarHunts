"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";

/**
 * Hook for managing referral data with consistent loading / error / empty states.
 */
export const useReferral = (userId = null) => {
  const [referralStats, setReferralStats] = useState({
    totalInvites: 0,
    activeUsers: 0,
    totalRewards: 0,
    totalXPEarned: 0,
    nextMilestone: "",
  });

  const [invitedUsers, setInvitedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchReferralData = useCallback(async (id) => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(`/api/referrals/${id}`, {
        withCredentials: true,
      });

      const stats = response.data?.stats ?? response.data;
      const users = response.data?.invitedUsers ?? [];
      setReferralStats(stats);
      setInvitedUsers(users);
    } catch (err) {
      console.error("Failed to fetch referral data:", err);
      setError("Failed to load referral data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      fetchReferralData(userId);
    }
  }, [userId, fetchReferralData]);

  const generateReferralLink = useCallback((id) => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://nft-hunt.com";
    return `${baseUrl}/ref/${id}`;
  }, []);

  const trackReferral = useCallback(
    async (referrerId, newUserId) => {
      try {
        const response = await axios.post(
          "/api/referrals/track",
          { referrerId, newUserId },
          { withCredentials: true },
        );

        await fetchReferralData(referrerId);
        return response?.data;
      } catch (err) {
        console.error("Failed to track referral:", err);
        throw err;
      }
    },
    [fetchReferralData],
  );

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

  return {
    referralStats,
    invitedUsers,
    loading,
    error,
    generateReferralLink,
    fetchReferralData,
    trackReferral,
    getRewardTier,
    getProgressToNextMilestone,
    shareReferral,
    copyReferralLink,
  };
};
