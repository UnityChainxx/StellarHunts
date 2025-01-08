import Link from 'next/link'
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-6">Welcome to NFT Scavenger Hunt Game</h1>
      <p className="text-xl mb-8">Solve puzzles, follow clues, and earn exclusive NFTs!</p>
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/game">Start Game</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/leaderboard">View Leaderboard</Link>
        </Button>
      </div>
    </main>
  )
}

