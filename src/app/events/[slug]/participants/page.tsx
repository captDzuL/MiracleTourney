import { notFound } from "next/navigation";

import { DataTable, Section } from "@/components/ui";
import { getPlayersForTeam, getPublicEventBySlug, getTeamsForEvent } from "@/lib/platform/demo-store";

export default async function ParticipantsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = getPublicEventBySlug(slug);
  if (!event) notFound();

  const teams = getTeamsForEvent(event.id);

  return (
    <Section title={`${event.name} participants`} description="Registered teams and current roster snapshot.">
      <DataTable
        columns={["Team", "Tag", "Roster"]}
        rows={teams.map((team) => [
          team.name,
          team.tag,
          (() => {
            const players = getPlayersForTeam(team.id);
            return players.length
              ? players.map((player) => `${player.nickname} (${player.position})`).join(", ")
              : "Roster pending";
          })(),
        ])}
      />
    </Section>
  );
}
