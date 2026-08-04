import { notFound } from "next/navigation";

import { DataTable, Section } from "@/components/ui";
import { getPlayersForTeams, getPublicEventBySlug, getTeamsForEvent } from "@/lib/platform/repository";

export default async function ParticipantsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getPublicEventBySlug(slug);
  if (!event) notFound();

  const teams = await getTeamsForEvent(event.id);
  const allPlayers = await getPlayersForTeams(teams.map((t) => t.id));
  const playersByTeam = new Map(teams.map((t) => [t.id, allPlayers.filter((p) => p.teamId === t.id)]));
  const teamsWithPlayers = teams.map((team) => ({ ...team, players: playersByTeam.get(team.id) ?? [] }));

  return (
    <Section title={`${event.name} participants`} description="Registered teams and current roster snapshot.">
      <DataTable
        columns={["Team", "Tag", "Captain", "Roster"]}
        rows={teamsWithPlayers.map((team) => [
          team.name,
          team.tag,
          team.captainName ?? "Unassigned",
          team.players.length
            ? team.players.map((player) => `${player.nickname} (${player.position})`).join(", ")
            : "Roster pending",
        ])}
      />
    </Section>
  );
}
