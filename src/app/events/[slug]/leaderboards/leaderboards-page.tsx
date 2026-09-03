import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackToEvent } from "@/components/public-v2/BackToEvent";
import { TeamIdentity } from "@/components/TeamAvatar";
import { DataTable, Section } from "@/components/ui";
import { getOrderedStatEntries } from "@/lib/platform/config";
import { getEventBySlug, getLeaderboardForEvent, getTeamsForEvent } from "@/lib/platform/repository";

export async function renderLeaderboardsPage(slug: string, locale?: "id" | "en") {
  const t = await getTranslations("leaderboard");
  const event = await getEventBySlug(slug);
  if (!event || event.status === "Draft") notFound();

  const [leaderboard, teams] = await Promise.all([
    getLeaderboardForEvent(event.id, event.gameId),
    getTeamsForEvent(event.id),
  ]);
  const teamLookup = new Map(teams.map((team) => [team.id, team]));

  return (
    <>
      <BackToEvent slug={slug} locale={locale} label={t("backToEvent")} />
      <Section
        title={t("sectionTitle", { name: event.name })}
        description={t("sectionDescription")}
      >
        <DataTable
          columns={[t("player"), t("position"), t("matches"), t("totals")]}
          rows={leaderboard.map((entry) => {
            const team = teamLookup.get(entry.teamId);

            return [
              <span key={entry.playerId} className="grid gap-2">
                <span className="pv-team-identity__name font-semibold text-slate-900">{entry.playerName}</span>
                {team ? <TeamIdentity logoText={team.logoText} logoUrl={team.logoUrl} name={team.name} size="sm" /> : null}
              </span>,
              entry.position,
              entry.matchesPlayed,
              getOrderedStatEntries(entry.totalStats, event.gameModeId, event.gameId)
                .map(([key, value]) => `${key}: ${value}`)
                .join(" - "),
            ];
          })}
        />
      </Section>
    </>
  );
}
