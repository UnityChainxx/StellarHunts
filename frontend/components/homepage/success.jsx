"use client";

import Image from "next/image";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { EmptyState, LoadingState } from "@/components/ui/StateDisplay";
import { isOptimisableImageSrc } from "@/lib/images";

const DEFAULT_EXPLORER_BASE =
  process.env.NEXT_PUBLIC_STELLAR_EXPLORER ||
  "https://stellar.expert/explorer/testnet";

/**
 * Build the explorer URL for a minted badge.
 *
 * Prefers an explicit `explorerUrl` (passed through the query string by the
 * mint flow); otherwise falls back to the configured Stellar explorer using
 * the badge's token id. Returns `null` when neither is available so the link
 * is simply omitted instead of pointing at a dead page.
 */
function explorerUrlFor({ explorerUrl, tokenId }) {
  if (explorerUrl) return explorerUrl;
  if (tokenId) return `${DEFAULT_EXPLORER_BASE}/contract/${tokenId}`;
  return null;
}

/**
 * Presentational success screen for a minted NFT badge.
 *
 * Renders the badge that was actually minted (`mint`) or an explicit empty
 * state when no mint data is available — it never falls back to hardcoded
 * placeholder content.
 *
 * @param {Object}   props
 * @param {Object|null} props.mint    – { name, tokenId, image, explorerUrl }
 * @param {string}   [props.status]   – "confirmed" (default) or "pending"
 * @param {Function} [props.onHome]   – override for the home navigation
 */
export function NftMintSuccess({ mint, status = "confirmed", onHome }) {
  const router = useRouter();
  const goHome = onHome ?? (() => router.push("/"));

  if (status !== "confirmed") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-emerald-900 text-white flex items-center justify-center px-6">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-4">
          <h1 className="text-3xl font-bold text-amber-400">
            Transaction pending
          </h1>
          <p className="text-gray-300">
            We only show the NFT success screen after the on-chain transaction
            is confirmed.
          </p>
          <button
            onClick={goHome}
            className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-xl transition"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  const hasMint = Boolean(
    mint && (mint.name || mint.tokenId || mint.image),
  );

  if (!hasMint) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-emerald-900 text-white flex items-center justify-center px-6">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md w-full">
          <EmptyState
            title="No minted badge to show"
            description="We couldn't find the details of a badge for this transaction. Check your wallet or head back to the puzzles."
            action={
              <button
                onClick={goHome}
                className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-xl transition"
              >
                Go to Homepage
              </button>
            }
          />
        </div>
      </div>
    );
  }

  const { name, tokenId, image } = mint;
  const explorer = explorerUrlFor(mint);
  const canOptimise = isOptimisableImageSrc(image);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-emerald-900 text-white flex items-center justify-center px-6">
      <div className="bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-6">
        <h1 className="text-3xl font-bold text-green-400">
          🎉 NFT Minted Successfully!
        </h1>

        <div className="mt-4">
          {image ? (
            canOptimise ? (
              <Image
                src={image}
                alt={name || "Minted NFT badge"}
                width={400}
                height={400}
                className="w-full rounded-xl shadow-lg"
              />
            ) : (
              // Host not listed in next.config.mjs — render directly so an
              // unexpected URL never becomes a next/image configuration error.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt={name || "Minted NFT badge"}
                width={400}
                height={400}
                className="w-full rounded-xl shadow-lg"
              />
            )
          ) : (
            <div className="w-full aspect-square rounded-xl bg-gray-700/50 flex items-center justify-center text-gray-400">
              Badge image unavailable
            </div>
          )}
          {name && <p className="mt-4 text-lg font-semibold">{name}</p>}
          {tokenId && (
            <p className="text-sm text-gray-300">Token ID: #{tokenId}</p>
          )}
        </div>

        <div className="flex flex-col gap-4 mt-6">
          {explorer && (
            <a
              href={explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-xl transition"
            >
              View on Explorer
            </a>
          )}
          <button
            onClick={goHome}
            className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-xl transition"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    </div>
  );
}

function NftMintSuccessFromParams() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status") || "confirmed";
  const mint = {
    name: searchParams.get("name"),
    tokenId: searchParams.get("tokenId"),
    image: searchParams.get("image"),
    explorerUrl: searchParams.get("explorerUrl"),
  };

  return <NftMintSuccess mint={mint} status={status} />;
}

/**
 * Route entry point. Reads the mint result from the query string and renders
 * the success screen. Wrapped in `Suspense` because `useSearchParams` opts the
 * subtree into client-side rendering.
 */
export default function NFTSuccessPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading transaction details..." />}>
      <NftMintSuccessFromParams />
    </Suspense>
  );
}
