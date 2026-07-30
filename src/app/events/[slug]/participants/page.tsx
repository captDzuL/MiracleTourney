import { notFound } from "next/navigation";

import { DataTable, Section } from "@/components/ui";
import { getEventBySlug, getPlayersForTeam, getTeamsForEvent } from "@/lib/platform/demo-store";

export default async function ParticipantsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = getEventBySlug(slug);
  if (!event) notFound();

  const teams = getTeamsForEvent(event.id);

  return (
    <Section title={`${event.name} participants`} description="Registered teams and current roster snapshot.">
      <DataTable
        columns={["Team", "Tag", "Roster"]}
        rows={teams.map((team) => [
          team.name,
          team.tag,
          getPlayersForTeam(team.id)
            .map((player) => `${player.nickname} (${player.position})`)
            .join(", "),
        ])}
      />
    </Section>
  );
}
