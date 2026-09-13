import { notFound } from "next/navigation";

import { BackToEvent } from "@/components/public-v2/BackToEvent";
import { PublicScheduleBoard, type PublicScheduleMatch } from "@/components/v3/public-event/PublicScheduleBoard";
import { Section } from "@/components/ui";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getPublicDrawingEvent, getPublicFinishedEvent } from "@/lib/events/adaptive-public-phases";
import { getPublicOngoingEvent } from "@/lib/events/public-ongoing";
import { publicMatchLabel } from "@/lib/events/public-match-label";
import { getEventRoundConfigs, getMatchesForEvent, getPublicEventBySlug, getTeamsForEvent } from "@/lib/platform/repository";

export async function renderSchedulePage(slug: string, locale: "id" | "en" = "id") {
  const event = await getPublicEventBySlug(slug);
  if (!event) notFound();
  let matches: PublicScheduleMatch[] = [];
  let unpublished = false;

  if (isFeatureEnabled("adaptive_public_event_v3")) {
    if (["Published", "Registration Closed"].includes(event.status)) {
      const drawing = await getPublicDrawingEvent(slug).catch(() => null);
      unpublished = !drawing?.schedule;
      matches = drawing?.schedule ? drawing.matches : [];
    } else if (event.status === "Ongoing") {
      const ongoing = await getPublicOngoingEvent(slug).catch(() => null);
      unpublished = !ongoing?.schedule;
      matches = ongoing?.schedule ? ongoing.matches.map((match) => ({
        ...match,
        roundLabel: publicMatchLabel(match, locale),
      })) : [];
    } else if (event.status === "Finished") {
      const finished = await getPublicFinishedEvent(slug).catch(() => null);
      matches = finished?.matches ?? [];
    } else {
      unpublished = true;
    }
  } else {
    const [rows, teams, roundConfigs] = await Promise.all([
      getMatchesForEvent(event.id),
      getTeamsForEvent(event.id),
      getEventRoundConfigs(event.id),
    ]);
    const names = new Map(teams.map((team) => [team.id, team.name]));
    const bestOf = new Map(roundConfigs.map((config) => [config.roundLabel, config.bestOf]));
    matches = rows.map((match) => ({
      id: match.id,
      roundLabel: match.roundLabel,
      home: names.get(match.homeTeamId) ?? null,
      away: names.get(match.awayTeamId) ?? null,
      status: match.status === "Completed" ? "completed" : "scheduled",
      homeScore: match.status === "Completed" ? match.homeScore : null,
      awayScore: match.status === "Completed" ? match.awayScore : null,
      start: null,
      room: null,
      bestOf: bestOf.get(match.roundLabel) ?? 1,
    }));
  }

  return <>
    <BackToEvent slug={slug} locale={locale} label={locale === "id" ? "Kembali ke Event" : "Back to Event"} />
    <Section title={`${locale === "id" ? "Jadwal" : "Schedule"} ${event.name}`} description={locale === "id" ? "Fixture dan hasil resmi. Seluruh waktu ditampilkan dalam WIB." : "Official fixtures and results. All times are shown in WIB."}>
      <PublicScheduleBoard matches={matches} locale={locale} timezone="Asia/Jakarta" unpublished={unpublished} />
    </Section>
  </>;
}
