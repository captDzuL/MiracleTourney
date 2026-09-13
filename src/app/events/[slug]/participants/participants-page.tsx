import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackToEvent } from "@/components/public-v2/BackToEvent";
import { DataTable, Section } from "@/components/ui";
import { TeamIdentity } from "@/components/TeamAvatar";
import { PublicParticipantsDirectory } from "@/components/v3/public-event/PublicParticipantsDirectory";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getPlayersForTeams, getPublicEventBySlug, getTeamsForEvent } from "@/lib/platform/repository";
import { getCaptainDisplayName } from "@/lib/team-display";

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

  return (
    <>
      <BackToEvent slug={slug} locale={locale} label={t("backToEvent")} />
      <Section
        title={t("sectionTitle", { name: event.name })}
        description={t("sectionDescription")}
      >
      {isFeatureEnabled("adaptive_public_event_v3") ? <PublicParticipantsDirectory teams={directoryTeams} locale={locale ?? "id"} /> : <DataTable
        columns={[t("team"), t("tag"), t("captain"), t("roster")]}
        rows={teamsWithPlayers.map((team) => [
          <TeamIdentity key={team.id} logoText={team.logoText} logoUrl={team.logoUrl} name={team.name} meta={team.tag} />,
          team.tag,
          getCaptainDisplayName(team),
          team.players.length
            ? team.players.map((player) => `${player.nickname} (${player.position})`).join(", ")
            : t("rosterPending"),
        ])}
      />}
      </Section>
    </>
  );
}
