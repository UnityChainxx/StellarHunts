"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Check } from "lucide-react";

// Always share the canonical home/referral URL to prevent
// leaking puzzle IDs or internal routes via window.location.href.
const SHARE_URL =
  process.env.NEXT_PUBLIC_SHARE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://stellarhunts.com";

const ShareButton = () => {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareMessage =
      "Join me on StellarHunts - solve puzzles and earn exclusive NFTs! 🎮✨";

    if (navigator.share) {
      try {
        await navigator.share({
          title: "StellarHunts",
          text: shareMessage,
          url: SHARE_URL,
        });
        return;
      } catch (err) {
        // Fallback to clipboard without blocking alert
      }
    }

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${shareMessage}\n${SHARE_URL}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative inline-block">
      <Button
        onClick={handleShare}
        variant="outline"
        className="w-fit border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent font-bold py-4 px-8 rounded-lg transform transition-all hover:scale-105"
      >
        <span className="flex items-center gap-2">
          {copied ? <Check size={20} className="text-green-400" /> : <Share2 size={20} />}
          {copied ? "Copied!" : "Share"}
        </span>
      </Button>
      {copied && (
        <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded shadow-lg whitespace-nowrap z-50">
          Share link copied to clipboard!
        </span>
      )}
    </div>
  );
};

export default ShareButton;
