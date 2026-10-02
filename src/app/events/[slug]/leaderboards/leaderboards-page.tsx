import React from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackToEvent } from "@/components/public-v2/BackToEvent";
import { FlashpeakLeaderboardTable, type FlashpeakLeaderboardEmptyState } from "@/components/v3/public-event/FlashpeakLeaderboardTable";
import { PublicV3Action, PublicV3Count, PublicV3Eyebrow, PublicV3SectionHeading } from "@/components/v3/public-discovery/PublicV3Primitives";
import { TeamIdentity } from "@/components/TeamAvatar";
import { DataTable, Section } from "@/components/ui";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrderedStatEntries } from "@/lib/platform/config";
import {
  getEventBySlug,
  getFlashpeakLeaderboardForEvent,
  getFlashpeakLeaderboardForEventResult,
  getLeaderboardForEvent,
  getTeamsForEvent,
} from "@/lib/platform/repository";

export async function renderLeaderboardsPage(slug: string, locale?: "id" | "en") {
  const t = await getTranslations("leaderboard");
  const event = await getEventBySlug(slug);
  if (!event || event.status === "Draft") notFound();

  if (event.gameId === "game-flashpeak") {
    if (isFeatureEnabled("ui_v3_foundation")) {
      const result = await getFlashpeakLeaderboardForEventResult(event.id);
      const emptyState: FlashpeakLeaderboardEmptyState = result.status === "error" ? "error" : result.status === "empty" ? "no-data" : "no-matches";
      const eventHref = `${locale ? `/${locale}` : ""}/events/${event.slug}`;
      return (
        <div className="miracle-public-v3 mpv3-leaderboard-page">
          <div className="mpv3-directory-breadcrumb">
            <PublicV3Action href={eventHref} variant="text">← {t("backToEvent")}</PublicV3Action>
          </div>
          <div className="mpv3-directory-heading">
            <div>
              <PublicV3Eyebrow>{t("eyebrow")}</PublicV3Eyebrow>
              <h1>{t("sectionTitle", { name: event.name })}</h1>
              <p>{t("sectionDescription")}</p>
            </div>
            <div className="mpv3-directory-counts">
              <PublicV3Count value={result.status === "ready" ? result.entries.length : null} label={t("publishedStats")} fallback="—" />
            </div>
          </div>
          <section className="mpv3-section" aria-labelledby="leaderboard-table-heading">
            <PublicV3SectionHeading id="leaderboard-table-heading" title={t("tableHeading")} />
            <FlashpeakLeaderboardTable entries={result.entries} locale={locale ?? "id"} emptyState={emptyState} presentation="v3" />
          </section>
        </div>
      );
    }

    const leaderboard = await getFlashpeakLeaderboardForEvent(event.id);
    return (
      <>
        <BackToEvent slug={slug} locale={locale} label={t("backToEvent")} />
        <Section
          title={t("sectionTitle", { name: event.name })}
          description={t("sectionDescription")}
        >
          <FlashpeakLeaderboardTable entries={leaderboard} locale={locale ?? "id"} presentation="legacy" />
        </Section>
      </>
    );
  }

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
