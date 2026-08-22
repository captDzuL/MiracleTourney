import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CalendarDays, ListTree, Trophy, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LiveStreamCard, Pill, Section, StatCard } from "@/components/ui";
import { PublicEventDetailV2 } from "@/components/public-v2/PublicEventDetailV2";
import { ShareButton } from "@/components/ShareButton";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrderedStatEntries, getStatKeysForMode } from "@/lib/platform/config";
import type { Event } from "@/lib/platform/types";
import { getEventBackgroundUrl } from "@/lib/platform/visuals";
import {
  getBracketPreview,
  getCertificateByEvent,
  getGameForEvent,
  getLeaderboardForEvent,
  getModeForEvent,
  getPublicEventBySlug,
  getTeamsForEvent,
} from "@/lib/platform/repository";
import { getLiveStreamPresentation } from "@/lib/tournament/engine";

const fallbackEventsBySlug: Record<string, Event> = {
  "miracle-league": {
    id: "fallback-miracle-league",
    slug: "miracle-league",
    name: "Miracle Fast Tour",
    description: "New event created from admin panel.",
    logoUrl: "https://lh3.googleusercontent.com/d/1m01dWpxKA6qXRzfFRrEovFzho1nTnV9B",
    gameId: "game-flashpeak",
    gameModeId: "mode-flashpeak-5v5",
    format: "Single Elimination",
    status: "Ongoing",
    participantCap: 32,
    registrationWindow: "TBD",
    startsAt: "TBD",
    venue: "Online",
  },
  "kuroko-summer-cup": {
    id: "fallback-kuroko-summer-cup",
    slug: "kuroko-summer-cup",
    name: "Kuroko Street Rival Summer Cup",
    description: "Demo tournament for public browsing and testing flows.",
    gameId: "game-kuroko",
    gameModeId: "mode-kuroko-3v3",
    format: "Single Elimination",
    status: "Published",
    participantCap: 8,
    registrationWindow: "Open",
    startsAt: "2026-09-01",
    venue: "Online",
  },
};

function buildEventHref(slug: string, section: "participants" | "bracket" | "standings" | "leaderboards", locale?: "id" | "en") {
  const prefix = locale ? `/${locale}` : "";
  return `${prefix}/events/${slug}/${section}`;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export async function renderEventDetailPage(slug: string, locale?: "id" | "en") {
  const t = await getTranslations("eventDetail");
  const fallbackEvent = fallbackEventsBySlug[slug];
  const event = await getPublicEventBySlug(slug).catch(() => fallbackEvent ?? null);

  if (!event) notFound();

  const game = getGameForEvent(event);
  const mode = getModeForEvent(event);
  const trackedStatKeys = getStatKeysForMode(event.gameModeId, event.gameId);
  const [teams, bracket, leaderboard] = await Promise.all([
    getTeamsForEvent(event.id).catch(() => []),
    getBracketPreview(event.id).catch(() => []),
    getLeaderboardForEvent(event.id, event.gameId).catch(() => []),
  ]);
  const liveView = event.stream?.enabled ? getLiveStreamPresentation(event.stream.url) : null;
  const certificate = event.status === "Finished" ? await getCertificateByEvent(event.id).catch(() => null) : null;
  const backgroundUrl = getEventBackgroundUrl(event);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "name": event.name,
    "description": event.description,
    "location": { "@type": "Place", "name": event.venue },
    "organizer": { "@type": "Organization", "name": event.organizerName ?? "Miracle League" },
    "sport": game.name,
    ...(event.startsAt && event.startsAt !== "TBD" ? { "startDate": event.startsAt } : {}),
    ...(event.prizePoolLabel ? { "prize": event.prizePoolLabel } : {}),
  };

  const supportingSections = (
    <>
      {certificate ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-semibold text-emerald-800">Champion proof published</p>
          <a href={certificate.imageUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all text-sm font-medium text-emerald-700 underline">
            View certificate
          </a>
        </section>
      ) : null}

      {event.stream?.enabled && liveView ? (
        <LiveStreamCard
          label={event.stream.label}
          watchUrl={event.stream.url}
          embedUrl={liveView.embedUrl}
          shouldEmbed={liveView.shouldEmbed}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title={t("quickLinks")} description={t("quickLinksDesc")} className="rounded-xl shadow-none">
          <div className="grid gap-3 text-sm">
            <EventLink href={buildEventHref(event.slug, "participants", locale)}>{t("participants")}</EventLink>
            <EventLink href={buildEventHref(event.slug, "bracket", locale)}>{t("bracketLink")}</EventLink>
            <EventLink href={buildEventHref(event.slug, "standings", locale)}>{t("standingsLink")}</EventLink>
            <EventLink href={buildEventHref(event.slug, "leaderboards", locale)}>{t("leaderboardLink")}</EventLink>
          </div>
        </Section>

        <Section title={t("formatSnapshot")} description={t("formatSnapshotDesc")} className="rounded-xl shadow-none">
          <div className="space-y-3 text-sm text-slate-700">
            <p className="flex items-center gap-2 font-medium text-slate-950">
              <ListTree className="h-4 w-4 text-cyan-600" /> {event.format}
            </p>
            <p>{t("mode", { n: mode.teamSize })}</p>
            <p>{t("rosterLimit", { n: mode.maxRosterSize })}</p>
            <p>{t("trackedStats", { stats: trackedStatKeys.join(", ") })}</p>
          </div>
        </Section>

        <Section title={t("topPerformer")} description={t("topPerformerDesc")} className="rounded-xl shadow-none">
          {leaderboard[0] ? (
            <div className="space-y-2 text-sm text-slate-700">
              <p className="text-lg font-semibold text-slate-950">{leaderboard[0].playerName}</p>
              <p>{leaderboard[0].position} - {leaderboard[0].matchesPlayed} matches</p>
              <p className="font-medium text-cyan-700">
                {getOrderedStatEntries(leaderboard[0].totalStats, event.gameModeId, event.gameId)
                  .slice(0, 3)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(" - ")}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t("noStats")}</p>
          )}
        </Section>
      </div>
    </>
  );

  if (isFeatureEnabled("public_visual_v2")) {
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <PublicEventDetailV2
          event={event}
          game={game}
          mode={mode}
          teams={teams}
          bracket={bracket}
          locale={locale}
          labels={{
            liveNow: t("liveNow"),
            organizer: t("organizerLabel"),
            issue: t("issueLabel"),
            teamCount: t("teamCount", { registered: teams.length, cap: event.participantCap }),
            register: t("register"),
            quickLinks: t("quickLinks"),
            participants: t("participants"),
            bracket: t("bracketLink"),
            standings: t("standingsLink"),
            leaderboards: t("leaderboardLink"),
          }}
        >
          {supportingSections}
        </PublicEventDetailV2>
      </>
    );
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    <div className="space-y-6">
      <section
        className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]"
        style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/68 to-slate-950/28" />
        <div className="absolute inset-0 bg-slate-950/18" />
        <div className="relative flex flex-col gap-4 border-b border-white/15 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid min-w-0 gap-4 sm:grid-cols-[88px_minmax(0,1fr)]">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/35 bg-white/95 text-slate-500 shadow-sm">
              {event.logoUrl ? (
                <img src={event.logoUrl} alt={`${event.name} logo`} className="h-full w-full object-contain" />
              ) : (
                <span className="text-lg font-semibold text-slate-700">{getInitials(event.name) || "EV"}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
              <Pill>{game.name}</Pill>
              <Pill>{mode.name}</Pill>
              <Pill>{event.format}</Pill>
              <Pill tone={event.stream?.enabled && event.stream.isLive ? "live" : "default"}>
                {event.stream?.enabled && event.stream.isLive ? t("liveNow") : event.status}
              </Pill>
              {event.organizerVerified ? <Pill tone="success">Verified Organizer</Pill> : null}
              </div>
              <h1 className="mt-4 text-3xl font-semibold text-white">{event.name}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200">{event.description}</p>
              <p className="mt-3 text-sm font-semibold text-slate-100">
                Organizer: {event.organizerName ?? "Miracle Organizer"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-sm text-slate-100 lg:max-w-sm lg:justify-end">
            <ShareButton />
            <EventFact icon={<CalendarDays className="h-4 w-4 text-cyan-600" />}>
              {event.registrationWindow}
            </EventFact>
            <EventFact icon={<Users className="h-4 w-4 text-cyan-600" />}>
              {t("teamCount", { registered: teams.length, cap: event.participantCap })}
            </EventFact>
            <EventFact icon={<Trophy className="h-4 w-4 text-cyan-600" />}>
              {event.prizePoolLabel ?? event.venue}
            </EventFact>
            {event.registrationFeeLabel ? (
              <EventFact icon={<Trophy className="h-4 w-4 text-cyan-600" />}>
                {event.registrationFeeLabel}
              </EventFact>
            ) : null}
            {event.registrationUrl ? (
              <a
                className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-300"
                href={event.registrationUrl}
                target="_blank"
                rel="noreferrer"
              >
                Daftar Event
                <ArrowRight className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 md:grid-cols-3">
          <div className="relative bg-white p-4">
            <StatCard
              label={t("bracketStat")}
              value={bracket.length}
              hint={event.format === "Single Elimination" ? t("bracketHint") : t("standingsHint")}
            />
          </div>
          <div className="relative bg-white p-4">
            <StatCard label={t("standingsStat")} value={mode.positions.length} hint={mode.positions.join(", ")} />
          </div>
          <div className="relative bg-white p-4">
            <StatCard label={t("leaderboardStat")} value={leaderboard.length} hint={t("leaderboardHint")} />
          </div>
        </div>
      </section>

      {supportingSections}
    </div>
    </>
  );
}

function EventFact({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 ring-1 ring-slate-200">
      {icon}
      {children}
    </span>
  );
}

function EventLink({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <Link
      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-800"
      href={href}
    >
      <span>{children}</span>
      <ArrowRight className="h-4 w-4 shrink-0" />
    </Link>
  );
}
