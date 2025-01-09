import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

async function getLeaderboard() {
  // TODO: Fetch leaderboard data from smart contract
  // This is a placeholder. Replace with actual data fetching logic.
  return [
    { name: "Alice", score: 1000 },
    { name: "Bob", score: 850 },
    { name: "Charlie", score: 750 },
  ];
}

export default async function Leaderboard() {
  const leaders = await getLeaderboard();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h2 className="text-3xl font-bold mb-6">Leaderboard</h2>
      <Table>
        <TableCaption>Top players in the NFT Scavenger Hunt</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Rank</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leaders.map((leader, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">{index + 1}</TableCell>
              <TableCell>{leader.name}</TableCell>
              <TableCell className="text-right">{leader.score}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
