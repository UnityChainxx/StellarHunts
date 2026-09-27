import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Hoisted mocks: the page components are rendered against controllable hook
// state so every branch (loading / error / empty / populated) can be asserted
// without a real network or query client.
const mockRoadmap = vi.fn();
vi.mock("@/hooks/useRoadmap", () => ({
  useRoadmap: (...args) => mockRoadmap(...args),
  default: (...args) => mockRoadmap(...args),
}));

const mockReferrer = vi.fn();
vi.mock("@/hooks/useReferrer", () => ({
  useReferrer: (...args) => mockReferrer(...args),
  default: (...args) => mockReferrer(...args),
}));

const mockReferral = vi.fn();
vi.mock("@/hooks/useReferral", () => ({
  useReferral: (...args) => mockReferral(...args),
  default: (...args) => mockReferral(...args),
}));

vi.mock("@/store/auth/auth-store", () => ({
  default: (selector) => selector({ user: { id: "user-1" } }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ referralId: "abc" }),
  useRouter: () => ({ push: vi.fn() }),
}));

import PuzzleRoadmapPage from "@/app/puzzles/roadmap/app";
import ReferralLandingPage from "@/app/ref/[referralId]/page";
import InviteFriendsPage from "@/app/invite-friends/page";

const puzzle = {
  id: "1",
  title: "Genesis Puzzle",
  description: "Start your journey into puzzles.",
  imageUrl: "/images/genesis.png",
  releaseDate: "2025-08-01",
};

describe("Puzzle roadmap page states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a loading state while the roadmap is in flight", () => {
    mockRoadmap.mockReturnValue({
      isLoading: true,
      error: null,
      data: undefined,
      refetch: vi.fn(),
    });

    render(<PuzzleRoadmapPage />);
    expect(screen.getByText(/Loading puzzle roadmap/i)).toBeInTheDocument();
  });

  it("renders an error state with a working retry", () => {
    const refetch = vi.fn();
    mockRoadmap.mockReturnValue({
      isLoading: false,
      error: new Error("Network down"),
      data: undefined,
      refetch,
    });

    render(<PuzzleRoadmapPage />);
    expect(screen.getByText(/Network down/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders an empty state when there are no puzzles", () => {
    mockRoadmap.mockReturnValue({
      isLoading: false,
      error: null,
      data: [],
      refetch: vi.fn(),
    });

    render(<PuzzleRoadmapPage />);
    expect(screen.getByText(/No puzzles scheduled yet/i)).toBeInTheDocument();
  });

  it("renders the roadmap when data is present", () => {
    mockRoadmap.mockReturnValue({
      isLoading: false,
      error: null,
      data: [puzzle],
      refetch: vi.fn(),
    });

    render(<PuzzleRoadmapPage />);
    expect(screen.getByText("Genesis Puzzle")).toBeInTheDocument();
  });
});

describe("Referral landing page states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a loading state while the referrer is in flight", () => {
    mockReferrer.mockReturnValue({
      isLoading: true,
      error: null,
      data: undefined,
      refetch: vi.fn(),
    });

    render(<ReferralLandingPage />);
    expect(screen.getByText(/Loading referral/i)).toBeInTheDocument();
  });

  it("renders an error state with a working retry", () => {
    const refetch = vi.fn();
    mockReferrer.mockReturnValue({
      isLoading: false,
      error: new Error("Referral lookup failed"),
      data: undefined,
      refetch,
    });

    render(<ReferralLandingPage />);
    expect(screen.getByText(/Referral lookup failed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders an empty state for an unknown referral", () => {
    mockReferrer.mockReturnValue({
      isLoading: false,
      error: null,
      data: null,
      refetch: vi.fn(),
    });

    render(<ReferralLandingPage />);
    expect(screen.getByText(/Referral not found/i)).toBeInTheDocument();
  });

  it("renders the referral once the referrer is known", () => {
    mockReferrer.mockReturnValue({
      isLoading: false,
      error: null,
      data: { username: "crypto_explorer", level: 15, totalInvites: 8 },
      refetch: vi.fn(),
    });

    render(<ReferralLandingPage />);
    expect(screen.getByText(/You've Been Invited!/i)).toBeInTheDocument();
    expect(screen.getAllByText("crypto_explorer").length).toBeGreaterThan(0);
  });
});

describe("Invite friends page states", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseState = {
    referralStats: {
      totalInvites: 0,
      activeUsers: 0,
      totalRewards: 0,
      totalXPEarned: 0,
      nextMilestone: "",
    },
    invitedUsers: [],
    loading: false,
    error: null,
    generateReferralLink: () => "https://nft-hunt.com/ref/user-1",
    fetchReferralData: vi.fn(),
    shareReferral: vi.fn(),
  };

  it("renders a loading state while referrals load", () => {
    mockReferral.mockReturnValue({ ...baseState, loading: true });
    render(<InviteFriendsPage />);
    expect(screen.getByText(/Loading your referrals/i)).toBeInTheDocument();
  });

  it("renders an error state with a working retry", () => {
    const fetchReferralData = vi.fn();
    mockReferral.mockReturnValue({
      ...baseState,
      error: new Error("Referral service unavailable"),
      fetchReferralData,
    });

    render(<InviteFriendsPage />);
    expect(
      screen.getByText(/Referral service unavailable/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(fetchReferralData).toHaveBeenCalledWith("user-1");
  });

  it("renders an empty state when no friends have been invited", () => {
    mockReferral.mockReturnValue(baseState);
    render(<InviteFriendsPage />);
    expect(screen.getByText(/No friends invited yet/i)).toBeInTheDocument();
  });

  it("renders invited friends when data is present", () => {
    mockReferral.mockReturnValue({
      ...baseState,
      referralStats: { ...baseState.referralStats, totalInvites: 1 },
      invitedUsers: [
        {
          id: 1,
          username: "crypto_explorer",
          joinedDate: "2024-01-15",
          status: "active",
          rewardEarned: "Rare NFT",
          xpBonus: 50,
        },
      ],
    });

    render(<InviteFriendsPage />);
    expect(screen.getByText("crypto_explorer")).toBeInTheDocument();
  });
});
