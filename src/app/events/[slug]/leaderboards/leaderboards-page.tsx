import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { DataTable, Section } from "@/components/ui";
import { getOrderedStatEntries } from "@/lib/platform/config";
import { getEventBySlug, getLeaderboardForEvent } from "@/lib/platform/repository";

export async function renderLeaderboardsPage(slug: string) {
  const t = await getTranslations("leaderboard");
  const event = await getEventBySlug(slug);
  if (!event || event.status === "Draft") notFound();

  const leaderboard = await getLeaderboardForEvent(event.id, event.gameId);

  return (
    <Section
      title={t("sectionTitle", { name: event.name })}
      description={t("sectionDescription")}
    >
      <DataTable
        columns={[t("player"), t("position"), t("matches"), t("totals")]}
        rows={leaderboard.map((entry) => [
          entry.playerName,
          entry.position,
          entry.matchesPlayed,
          getOrderedStatEntries(entry.totalStats, event.gameModeId, event.gameId)
            .map(([key, value]) => `${key}: ${value}`)
            .join(" · "),
        ])}
      />
    </Section>
  );
}
