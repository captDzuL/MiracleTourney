import { notFound } from "next/navigation";

import { DataTable, Section } from "@/components/ui";
import { getPlayersForTeam, getPublicEventBySlug, getTeamsForEvent } from "@/lib/platform/repository";

export default async function ParticipantsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getPublicEventBySlug(slug);
  if (!event) notFound();

  const teams = await getTeamsForEvent(event.id);
  const teamsWithPlayers = await Promise.all(
    teams.map(async (team) => ({
      ...team,
      players: await getPlayersForTeam(team.id),
    })),
  );

  return (
    <Section title={`${event.name} participants`} description="Registered teams and current roster snapshot.">
      <DataTable
        columns={["Team", "Tag", "Roster"]}
        rows={teamsWithPlayers.map((team) => [
          team.name,
          team.tag,
          team.players.length
            ? team.players.map((player) => `${player.nickname} (${player.position})`).join(", ")
            : "Roster pending",
        ])}
      />
    </Section>
  );
}
