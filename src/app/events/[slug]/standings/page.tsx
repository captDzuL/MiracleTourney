import { notFound } from "next/navigation";

import { DataTable, Section } from "@/components/ui";
import { getEventBySlug, getTeamStandings } from "@/lib/platform/demo-store";

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = getEventBySlug(slug);
  if (!event || event.status === "Draft") notFound();

  const standings = getTeamStandings(event.id);

  return (
    <Section title={`${event.name} standings`} description="Standard league scoring: win = 3, draw = 1, loss = 0.">
      <DataTable
        columns={["#", "Team", "P", "W", "D", "L", "Pts", "For", "Against", "Diff"]}
        rows={standings.map((standing) => [
          standing.rank,
          standing.teamName,
          standing.played,
          standing.wins,
          standing.draws,
          standing.losses,
          standing.points,
          standing.scoreFor,
          standing.scoreAgainst,
          standing.scoreDifference,
        ])}
      />
    </Section>
  );
}
