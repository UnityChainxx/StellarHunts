"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function HomePage() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full text-center space-y-8">
        <h1 className="text-4xl font-bold tracking-tight">
          Welcome to StellarHunts
        </h1>
        <p className="text-lg text-gray-600">
          Solve cryptographic puzzles and blockchain challenges to earn
          on-chain NFT rewards while learning about web3 technologies.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
          <Link
            href="/puzzles"
            className="block p-6 rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all"
          >
            <h2 className="text-xl font-semibold mb-2">Puzzles</h2>
            <p className="text-sm text-gray-500">
              Challenge yourself with blockchain riddles
            </p>
          </Link>

          <Link
            href="/leaderboard"
            className="block p-6 rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all"
          >
            <h2 className="text-xl font-semibold mb-2">Leaderboard</h2>
            <p className="text-sm text-gray-500">
              Compete with other players globally
            </p>
          </Link>

          <Link
            href="/rewards"
            className="block p-6 rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all"
          >
            <h2 className="text-xl font-semibold mb-2">Rewards</h2>
            <p className="text-sm text-gray-500">
              Claim your earned NFT badges
            </p>
          </Link>
        </div>

        {!session && (
          <div className="mt-8">
            <Link
              href="/auth/login"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Get Started
            </Link>
          </div>
        )}

        {session && (
          <div className="mt-8 text-gray-600">
            Signed in as {session.user?.email || session.user?.name}
          </div>
        )}
      </div>
    </div>
  );
}
