import React from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackToEvent } from "@/components/public-v2/BackToEvent";
import { PublicV3DetailFrame } from "@/components/v3/public-event/PublicV3DetailFrame";
import { DataTable, Section } from "@/components/ui";
import { TeamIdentity } from "@/components/TeamAvatar";
import { PublicParticipantsDirectory } from "@/components/v3/public-event/PublicParticipantsDirectory";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getPlayersForTeams, getPublicEventBySlug, getTeamsForEvent } from "@/lib/platform/repository";
import { getCaptainDisplayName } from "@/lib/team-display";

function V3ParticipantsTable({ columns, rows }: { columns: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="mpv3-table-wrap">
      <table className="min-w-[44rem]">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export async function renderParticipantsPage(slug: string, locale?: "id" | "en") {
  const t = await getTranslations("participants");
  const event = await getPublicEventBySlug(slug);
  if (!event) notFound();

  const teams = await getTeamsForEvent(event.id);
  const allPlayers = await getPlayersForTeams(teams.map((team) => team.id));
  const playersByTeam = new Map(teams.map((team) => [team.id, allPlayers.filter((p) => p.teamId === team.id)]));
  const teamsWithPlayers = teams.map((team) => ({ ...team, players: playersByTeam.get(team.id) ?? [] }));
  const directoryTeams = teamsWithPlayers.map((team) => ({
    id: team.id,
    name: team.name,
    tag: team.tag,
    captain: getCaptainDisplayName(team),
    players: team.players.map(({ id, nickname, displayName, position }) => ({ id, nickname, displayName, position })),
  }));
  const title = t("sectionTitle", { name: event.name });
  const description = t("sectionDescription");
  const adaptive = isFeatureEnabled("adaptive_public_event_v3");
  const columns = [t("team"), t("tag"), t("captain"), t("roster")];
  const rows = teamsWithPlayers.map((team) => [
    <TeamIdentity key={team.id} logoText={team.logoText} logoUrl={team.logoUrl} name={team.name} meta={team.tag} />,
    team.tag,
    getCaptainDisplayName(team),
    team.players.length
      ? team.players.map((player) => `${player.nickname} (${player.position})`).join(", ")
      : t("rosterPending"),
  ]);

  if (isFeatureEnabled("ui_v3_foundation")) {
    return (
      <PublicV3DetailFrame backLabel={t("backToEvent")} description={description} event={event} locale={locale} title={title}>
        <section className="mpv3-section" aria-label={title}>
          {adaptive ? <PublicParticipantsDirectory teams={directoryTeams} locale={locale ?? "id"} /> : <V3ParticipantsTable columns={columns} rows={rows} />}
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
      {adaptive ? <PublicParticipantsDirectory teams={directoryTeams} locale={locale ?? "id"} /> : <DataTable columns={columns} rows={rows} />}
      </Section>
    </>
  );
}
