import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackToEvent } from "@/components/public-v2/BackToEvent";
import { DataTable, Section } from "@/components/ui";
import { TeamIdentity } from "@/components/TeamAvatar";
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

  return (
    <>
      <BackToEvent slug={slug} locale={locale} label={t("backToEvent")} />
      <Section
        title={t("sectionTitle", { name: event.name })}
        description={t("sectionDescription")}
      >
      <DataTable
        columns={[t("team"), t("tag"), t("captain"), t("roster")]}
        rows={teamsWithPlayers.map((team) => [
          <TeamIdentity key={team.id} logoText={team.logoText} logoUrl={team.logoUrl} name={team.name} meta={team.tag} />,
          team.tag,
          getCaptainDisplayName(team),
          team.players.length
            ? team.players.map((player) => `${player.nickname} (${player.position})`).join(", ")
            : t("rosterPending"),
        ])}
      />
      </Section>
    </>
  );
}
