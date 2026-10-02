import React from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackToEvent } from "@/components/public-v2/BackToEvent";
import { PublicV3DetailFrame } from "@/components/v3/public-event/PublicV3DetailFrame";
import { DataTable, Section } from "@/components/ui";
import { TeamIdentity } from "@/components/TeamAvatar";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getPublicEventBySlug, getTeamsForEvent, getTeamStandings } from "@/lib/platform/repository";

function V3StandingsTable({ columns, rows }: { columns: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="mpv3-table-wrap">
      <table className="min-w-[44rem]">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export async function renderStandingsPage(slug: string, locale?: "id" | "en") {
  const t = await getTranslations("standings");
  const event = await getPublicEventBySlug(slug);
  if (!event) notFound();

  const [standings, teams] = await Promise.all([
    getTeamStandings(event.id),
    getTeamsForEvent(event.id),
  ]);
  const teamLookup = new Map(teams.map((team) => [team.id, team]));
  const columns = [
    t("rank"), t("team"), t("played"), t("win"),
    t("draw"), t("loss"), t("points"), t("for"),
    t("against"), t("diff"),
  ];
  const rows = standings.map((standing) => [
    standing.rank,
    (() => {
      const team = teamLookup.get(standing.teamId);
      return team ? (
        <TeamIdentity key={standing.teamId} logoText={team.logoText} logoUrl={team.logoUrl} name={team.name} />
      ) : standing.teamName;
    })(),
    standing.played,
    standing.wins,
    standing.draws,
    standing.losses,
    standing.points,
    standing.scoreFor,
    standing.scoreAgainst,
    standing.scoreDifference,
  ]);
  const title = t("sectionTitle", { name: event.name });
  const description = t("sectionDescription");

  if (isFeatureEnabled("ui_v3_foundation")) {
    return (
      <PublicV3DetailFrame backLabel={t("backToEvent")} description={description} event={event} locale={locale} title={title}>
        <section className="mpv3-section" aria-label={title}>
          <V3StandingsTable columns={columns} rows={rows} />
        </section>
      </PublicV3DetailFrame>
    );
  }

  return (
    <>
      <BackToEvent slug={slug} locale={locale} label={t("backToEvent")} />
      <Section
        title={title}
        description={description}
      >
        <DataTable columns={columns} rows={rows} />
      </Section>
    </>
  );
}
