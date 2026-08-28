import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Lock, Shield } from "lucide-react";

// Static rarity → gradient class lookup. Defined at module scope so the
// object identity is stable across renders and consumer prop identity
// comparisons (React.memo) aren't defeated by a fresh function on every
// parent render.
const RARITY_GRADIENTS = {
  Common: "from-blue-400 to-blue-600",
  Rare: "from-purple-400 to-purple-600",
  Epic: "from-pink-400 to-pink-600",
  Legendary: "from-amber-400 to-amber-600",
};

const getRarityColor = (rarity) =>
  RARITY_GRADIENTS[rarity] || "from-gray-400 to-gray-600";

// Displays a single NFT with rarity gradient, lock state, and claim action.
// Wrapped in React.memo so that when a parent re-renders (e.g. the wallet
// store updating) and passes the same `nft` reference to every card in
// a gallery, the heavy gradient DOM tree doesn't get re-reconciled for
// every card. Default shallow prop comparison is sufficient.
const NFTCard = ({ nft, onClaim = undefined }) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleKeyDown = useCallback(
    (e) => {
      if (!nft.locked && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onClaim?.(nft);
      }
    },
    [nft, onClaim]
  );

  return (
    <div
      role="article"
      aria-label={nft?.name ? `NFT: ${nft.name}${nft.locked ? " (locked)" : ""}` : "NFT card"}
      className="relative overflow-hidden transition-transform duration-300 group rounded-xl hover:scale-105 focus-within:ring-2 focus-within:ring-purple-500 focus-within:ring-offset-2 focus-within:ring-offset-black"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Card Background with Gradient */}
      <div className="absolute inset-0 border bg-gradient-to-br from-white/5 to-white/10 backdrop-blur-sm border-white/10" />

      {/* NFT Image Container */}
      <div className="relative p-4">
        <div className="relative mb-4 overflow-hidden rounded-lg aspect-square">
          {/* Image with Gradient */}
          <div
            className={`w-full h-full bg-gradient-to-br ${getRarityColor(
              nft.rarity
            )} opacity-80`}
          >
            {/* Using regular img tag with proper styling */}
            <img
              src={nft.src}
              alt={nft.name}
              className="object-cover w-full h-full mix-blend-overlay"
              loading="lazy"
            />
          </div>

          {/* Locked Overlay */}
          {nft.locked && (
            <div
              role="status"
              aria-label="This NFT is locked"
              className="absolute inset-0 flex items-center justify-center bg-black/60"
            >
              <Lock className="w-12 h-12 text-white/50" aria-hidden="true" />
            </div>
          )}

          {/* Rarity Badge */}
          <div
            className={`absolute top-2 right-2 px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${getRarityColor(
              nft.rarity
            )} text-white`}
          >
            {nft.rarity}
          </div>
        </div>

        {/* NFT Details */}
        <div className="relative z-10">
          <h3 className="mb-2 text-xl font-bold text-white">{nft.name}</h3>
          <p className="mb-4 text-sm text-gray-300">{nft.description}</p>

          {/* Requirements and Stats */}
          <div className="flex flex-wrap gap-3 mb-4 text-sm">
            {nft.requirements.map((req, index) => (
              <div
                key={index}
                className="flex items-center px-3 py-1 rounded-full bg-white/5"
              >
                <Shield className="w-4 h-4 mr-1 text-gray-400" />
                <span className="text-gray-300">{req}</span>
              </div>
            ))}
          </div>

          {/* Action Button */}
          <Button
            className={`w-full ${
              nft.locked
                ? "bg-white/10 text-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            }`}
            disabled={nft.locked}
            aria-disabled={nft.locked}
            aria-pressed={!nft.locked ? undefined : undefined}
            aria-label={nft.locked ? `${nft.name} is locked. Complete challenges to unlock.` : `Claim ${nft.name} NFT`}
            onKeyDown={handleKeyDown}
            tabIndex={0}
          >
            {nft.locked ? (
              <span className="flex items-center">
                <Lock className="w-4 h-4 mr-2" aria-hidden="true" />
                Complete Challenges to Unlock
              </span>
            ) : (
              <span className="flex items-center">
                <Sparkles className="w-4 h-4 mr-2" aria-hidden="true" />
                Claim NFT
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(NFTCard);