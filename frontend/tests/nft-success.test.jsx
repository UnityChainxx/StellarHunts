import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// `NftMintSuccess` reads the router for its default "Go to Homepage" action.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { NftMintSuccess } from "@/components/homepage/success";

describe("NFT success screen", () => {
  it("renders the badge that was actually minted", () => {
    render(
      <NftMintSuccess
        mint={{
          name: "Genesis Badge",
          tokenId: "42",
          image: "/badges/genesis.png",
          explorerUrl: "https://stellar.expert/explorer/testnet/contract/42",
        }}
      />,
    );

    expect(screen.getByText(/Genesis Badge/)).toBeInTheDocument();
    expect(screen.getByText(/Token ID: #42/)).toBeInTheDocument();
    expect(screen.getByAltText(/Genesis Badge/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /View on Explorer/i }),
    ).toHaveAttribute(
      "href",
      "https://stellar.expert/explorer/testnet/contract/42",
    );
  });

  it("renders an explicit empty state when there is no mint data", () => {
    render(<NftMintSuccess mint={null} />);

    expect(
      screen.getByText(/No minted badge to show/i),
    ).toBeInTheDocument();
    // No hardcoded placeholder content leaks through.
    expect(screen.queryByText(/OnlyDust/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/via\.placeholder\.com/i)).not.toBeInTheDocument();
  });

  it("renders a pending state until the transaction is confirmed", () => {
    render(
      <NftMintSuccess
        mint={{ name: "Genesis Badge", tokenId: "42" }}
        status="pending"
      />,
    );

    expect(screen.getByText(/Transaction pending/i)).toBeInTheDocument();
    expect(screen.queryByText(/Genesis Badge/)).not.toBeInTheDocument();
  });

  it("does not hand untrusted remote hosts to next/image", () => {
    // A remote host that is not in the allow-list must still render (as a
    // plain <img>) instead of throwing an image configuration error.
    render(
      <NftMintSuccess
        mint={{
          name: "Remote Badge",
          image: "https://evil.example.com/badge.png",
        }}
      />,
    );

    expect(screen.getByAltText(/Remote Badge/)).toBeInTheDocument();
  });
});
