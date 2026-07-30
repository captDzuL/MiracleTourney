import { notFound } from "next/navigation";

import { DataTable, Section } from "@/components/ui";
import { getEventBySlug, getLeaderboardForEvent } from "@/lib/platform/demo-store";

export default async function LeaderboardsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = getEventBySlug(slug);
  if (!event) notFound();

  const leaderboard = getLeaderboardForEvent(event.id);

  return (
    <Section title={`${event.name} player leaderboard`} description="Event-scoped aggregation of personal statistics.">
      <DataTable
        columns={["Player", "Position", "Matches", "Totals"]}
        rows={leaderboard.map((entry) => [
          entry.playerName,
          entry.position,
          entry.matchesPlayed,
          Object.entries(entry.totalStats)
            .map(([key, value]) => `${key}: ${value}`)
            .join(" · "),
        ])}
      />
    </Section>
  );
}
