import { notFound } from "next/navigation";

import { DataTable, Section } from "@/components/ui";
import { getBracketPreview, getEventBySlug, getTeamsForEvent } from "@/lib/platform/demo-store";

export default async function BracketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = getEventBySlug(slug);
  if (!event) notFound();

  const teamLookup = new Map(getTeamsForEvent(event.id).map((team) => [team.id, team.name]));
  const items = getBracketPreview(event.id);

  return (
    <Section title={`${event.name} bracket / fixtures`} description="Single elimination brackets or league fixtures derived from the tournament engine.">
      <DataTable
        columns={event.format === "Single Elimination" ? ["Round", "Slot", "Match"] : ["Round", "Fixture", "Type"]}
        rows={items.map((item) => {
          if ("byeForTeamId" in item) {
            return [
              `Round ${item.round}`,
              `Match ${item.slot}`,
              item.byeForTeamId
                ? `${teamLookup.get(item.byeForTeamId)} advances by bye`
                : `${teamLookup.get(item.homeTeamId ?? "") ?? "TBD"} vs ${teamLookup.get(item.awayTeamId ?? "") ?? "TBD"}`,
            ];
          }

          return [
            `Round ${item.round}`,
            `${(item.homeTeamId ? teamLookup.get(item.homeTeamId) : null) ?? "TBD"} vs ${(
              item.awayTeamId ? teamLookup.get(item.awayTeamId) : null
            ) ?? "TBD"}`,
            "League fixture",
          ];
        })}
      />
    </Section>
  );
}
