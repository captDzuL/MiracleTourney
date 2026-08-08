import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { DataTable, Section } from "@/components/ui";
import { getPublicEventBySlug, getTeamStandings } from "@/lib/platform/repository";

export async function renderStandingsPage(slug: string) {
  const t = await getTranslations("standings");
  const event = await getPublicEventBySlug(slug);
  if (!event) notFound();

  const standings = await getTeamStandings(event.id);

  return (
    <Section
      title={t("sectionTitle", { name: event.name })}
      description={t("sectionDescription")}
    >
      <DataTable
        columns={[
          t("rank"), t("team"), t("played"), t("win"),
          t("draw"), t("loss"), t("points"), t("for"),
          t("against"), t("diff"),
        ]}
        rows={standings.map((standing) => [
          standing.rank,
          standing.teamName,
          standing.played,
          standing.wins,
          standing.draws,
          standing.losses,
          standing.points,
          standing.scoreFor,
          standing.scoreAgainst,
          standing.scoreDifference,
        ])}
      />
    </Section>
  );
}
