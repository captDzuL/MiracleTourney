import { renderLeaderboardsPage } from "./leaderboards-page";

export default async function LeaderboardsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return renderLeaderboardsPage(slug);
}
