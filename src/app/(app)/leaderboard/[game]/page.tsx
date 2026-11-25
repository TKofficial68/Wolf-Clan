import { LeaderboardScreen } from "@/components/leaderboard";
export default async function LeaderboardPage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  return <LeaderboardScreen gameSlug={game} />;
}
