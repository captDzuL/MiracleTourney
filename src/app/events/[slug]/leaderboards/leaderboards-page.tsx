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

function V3LeaderboardPage({
  backLabel,
  children,
  count,
  description,
  event,
  locale,
  statLabel,
  tableHeading,
  title,
  eyebrow,
}: {
  backLabel: string;
  children: React.ReactNode;
  count: number | null;
  description: string;
  event: { name: string; slug: string };
  locale?: "id" | "en";
  statLabel: string;
  tableHeading: string;
  title: string;
  eyebrow: string;
}) {
  const eventHref = `${locale ? `/${locale}` : ""}/events/${event.slug}`;
  return (
    <div className="miracle-public-v3 mpv3-leaderboard-page">
      <div className="mpv3-directory-breadcrumb">
        <PublicV3Action href={eventHref} variant="text">← {backLabel}</PublicV3Action>
      </div>
      <div className="mpv3-directory-heading">
        <div>
          <PublicV3Eyebrow>{eyebrow}</PublicV3Eyebrow>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="mpv3-directory-counts">
          <PublicV3Count value={count} label={statLabel} fallback="—" />
        </div>
      </div>
      <section className="mpv3-section" aria-labelledby="leaderboard-table-heading">
        <PublicV3SectionHeading id="leaderboard-table-heading" title={tableHeading} />
        {children}
      </section>
    </div>
  );
}

function V3GenericLeaderboardTable({ columns, rows }: { columns: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="mpv3-table-wrap">
      <table className="min-w-[44rem]">
        <thead>
          <tr>
            {columns.map((column) => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function renderLeaderboardsPage(slug: string, locale?: "id" | "en") {
  const t = await getTranslations("leaderboard");
  const event = await getEventBySlug(slug);
  if (!event || event.status === "Draft") notFound();

  if (event.gameId === "game-flashpeak") {
    if (isFeatureEnabled("ui_v3_foundation")) {
      const result = await getFlashpeakLeaderboardForEventResult(event.id);
      const emptyState: FlashpeakLeaderboardEmptyState = result.status === "error" ? "error" : result.status === "empty" ? "no-data" : "no-matches";
      return (
        <V3LeaderboardPage
          backLabel={t("backToEvent")}
          count={result.status === "error" ? null : result.entries.length}
          description={t("sectionDescription")}
          event={event}
          eyebrow={t("eyebrow")}
          locale={locale}
          statLabel={t("publishedStats")}
          tableHeading={t("tableHeading")}
          title={t("sectionTitle", { name: event.name })}
        >
          <FlashpeakLeaderboardTable entries={result.entries} locale={locale ?? "id"} emptyState={emptyState} presentation="v3" />
        </V3LeaderboardPage>
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
  const genericColumns = [t("player"), t("position"), t("matches"), t("totals")];
  const makeGenericRows = (v3: boolean) => leaderboard.map((entry) => {
    const team = teamLookup.get(entry.teamId);
    const playerCell = v3 ? (
      <span key={entry.playerId} className="grid gap-1">
        <span className="font-semibold">{entry.playerName}</span>
        {team ? <span className="text-xs text-[var(--color-text-subtle)]">{team.name}</span> : null}
      </span>
    ) : (
      <span key={entry.playerId} className="grid gap-2">
        <span className="pv-team-identity__name font-semibold text-slate-900">{entry.playerName}</span>
        {team ? <TeamIdentity logoText={team.logoText} logoUrl={team.logoUrl} name={team.name} size="sm" /> : null}
      </span>
    );

    return [
      playerCell,
      entry.position,
      entry.matchesPlayed,
      getOrderedStatEntries(entry.totalStats, event.gameModeId, event.gameId)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" - "),
    ];
  });
  const genericRows = makeGenericRows(false);
  const v3GenericRows = makeGenericRows(true);

  if (isFeatureEnabled("ui_v3_foundation")) {
    return (
      <V3LeaderboardPage
        backLabel={t("backToEvent")}
        count={leaderboard.length}
        description={t("sectionDescription")}
        event={event}
        eyebrow={t("eyebrow")}
        locale={locale}
        statLabel={t("publishedStats")}
        tableHeading={t("tableHeading")}
        title={t("sectionTitle", { name: event.name })}
      >
        <V3GenericLeaderboardTable columns={genericColumns} rows={v3GenericRows} />
      </V3LeaderboardPage>
    );
  }

  return (
    <>
      <BackToEvent slug={slug} locale={locale} label={t("backToEvent")} />
      <Section
        title={t("sectionTitle", { name: event.name })}
        description={t("sectionDescription")}
      >
        <DataTable columns={genericColumns} rows={genericRows} />
      </Section>
    </>
  );
}
