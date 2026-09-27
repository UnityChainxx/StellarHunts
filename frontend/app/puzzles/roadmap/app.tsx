'use client';

import PuzzleTimeline from '@/components/puzzles/roadmap/PuzzleTimeline';
import ApiStateDisplay from '@/components/ui/StateDisplay';
import { useRoadmap } from '@/hooks/useRoadmap';

export default function PuzzleRoadmapPage() {
  const { data, isLoading, error, refetch } = useRoadmap();

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0f0c29] via-[#302b63] to-[#24243e] text-white py-12 px-4 md:px-16">
      <h1 className="text-4xl md:text-5xl font-bold text-center mb-12">
        Puzzle Roadmap
      </h1>
      <ApiStateDisplay
        isLoading={isLoading}
        error={error}
        data={data}
        onRetry={() => refetch()}
        loadingMessage="Loading puzzle roadmap..."
        emptyTitle="No puzzles scheduled yet"
        emptyDescription="The roadmap will appear here once puzzles are scheduled."
      >
        {(puzzles) => <PuzzleTimeline puzzles={puzzles} />}
      </ApiStateDisplay>
    </main>
  );
}
