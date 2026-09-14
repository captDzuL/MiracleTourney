import { ArrowRight } from "lucide-react";
import { publicV3LocalizedHref, resolvePublicV3Route, type PublicV3EventViewModel, type PublicV3Locale, type PublicV3Match } from "@/lib/events/public-v3-types";
import { EventPosterStage } from "./EventPosterStage";
import { PublicV3Action, PublicV3Eyebrow, PublicV3FactStrip, PublicV3StatusBadge } from "./PublicV3Primitives";
import { homeCopy, homeDate, homeStatusExplanation } from "./home-copy";

export function highlightedMatch(view: PublicV3EventViewModel): PublicV3Match | undefined {
  if (view.mode === "ongoing") return view.liveMatches[0] ?? view.nextMatches[0] ?? view.recentResults[0];
  if (view.mode === "finished") return view.matches.filter((match) => match.official).at(-1);
  return undefined;
}
export function PhaseHighlight({ view, locale }: { view: PublicV3EventViewModel; locale: PublicV3Locale }) {
  const t = homeCopy[locale];
  const match = highlightedMatch(view);
  const teamName = (value: string | null) => view.teams.find((team) => team.id === value)?.name ?? value ?? t.pending;
  const label = match?.status === "live" ? t.live : match?.official ? t.official : t.next;
  return <div className="mpv3-hero-match" data-phase-highlight data-status-key={view.statusExplanationKey}>
    {match ? <>
      <div className="mpv3-hero-match-top"><PublicV3Eyebrow>{label} · {match.roundLabel}</PublicV3Eyebrow><span>{t.bestOf} {match.bestOf}</span></div>
      <div className="mpv3-hero-match-score"><span>{teamName(match.home)}</span><strong>{match.official && match.homeScore !== null && match.awayScore !== null ? `${match.homeScore} : ${match.awayScore}` : "VS"}</strong><span>{teamName(match.away)}</span></div>
      {!match.official && <p>{t.noScore}</p>}
    </> : view.mode === "registration" ? <>
      <div className="mpv3-hero-match-top"><PublicV3Eyebrow>{view.registration.activeTeamCount} / {view.registration.participantCap} {t.registered}</PublicV3Eyebrow><span>{view.registration.remainingSlots} {t.slots}</span></div>
      <p>{homeStatusExplanation(view, locale)}</p>
    </> : view.mode === "drawing" ? <>
      <PublicV3Eyebrow tone="violet">{view.drawing.published ? t.drawingReady : t.drawingPending}</PublicV3Eyebrow>
      <p>{homeDate(view.facts.startsAt, locale, view.facts.timezone)}</p>
    </> : <p>{view.mode === "finished" ? t.resultsPending : t.noMatch}</p>}
  </div>;
}
export function FeaturedEventHero({ view, locale, gameSlug }: { view: PublicV3EventViewModel; locale: PublicV3Locale; gameSlug?: string }) {
  const t = homeCopy[locale];
  const identity = view.identity;
  const phaseLabel = { ongoing: t.live, registration: t.registration, drawing: t.drawing, finished: t.final }[view.mode];
  // Login CTAs intentionally have no href (RegistrationEntryCta opens the captain dialog).
  // Use the existing login page's safe returnTo flow for this server-rendered link.
  const registrationTarget = view.mode === "registration" && view.cta.kind === "login" && view.cta.enabled
    ? publicV3LocalizedHref("/login?returnTo=" + encodeURIComponent(resolvePublicV3Route(identity.routes.register, locale)))[locale]
    : view.cta.hrefByLocale?.[locale];
  const secondaryTarget = view.mode === "registration" ? registrationTarget : view.navigation.bracket ? resolvePublicV3Route(identity.routes.bracket, locale) : view.navigation.leaderboard ? resolvePublicV3Route(identity.routes.leaderboard, locale) : null;
  const registrationLabels: Record<string, string> = {
    register_team: t.register, registration_unavailable: t.registrationUnavailable,
    registration_closed: locale === "id" ? "Pendaftaran ditutup" : "Registration closed",
    registration_full: locale === "id" ? "Slot pendaftaran penuh" : "Registration full",
    registration_upcoming: locale === "id" ? "Pendaftaran belum dibuka" : "Registration not open yet",
  };
  const secondaryLabel = view.mode === "registration" ? registrationLabels[view.cta.label] ?? t.register : view.navigation.bracket ? t.viewBracket : t.viewLeaderboard;
  return <section data-featured-event={identity.slug} data-public-v3-event="true" data-public-source={view.source} className="mpv3-featured" aria-labelledby="featured-title">
    <div className="mpv3-hero-grid">
      <div className="mpv3-hero-copy">
        <PublicV3StatusBadge status={view.mode} label={phaseLabel} />
        <h1 id="featured-title">{identity.title}</h1>
        <p className="mpv3-home-description">{identity.description}</p>
        <PhaseHighlight view={view} locale={locale} />
        <div className="mpv3-actions"><PublicV3Action variant="primary" href={resolvePublicV3Route(identity.routes.overview, locale)}>{t.explore}<ArrowRight aria-hidden="true" /></PublicV3Action>
          {(secondaryTarget || view.mode === "registration") && <PublicV3Action href={view.mode === "registration" && !view.cta.enabled ? null : secondaryTarget}>{secondaryLabel}</PublicV3Action>}
        </div>
        <p className="mpv3-home-metadata"><strong>{identity.game.name}</strong> · {identity.game.modeName}<span>{view.facts.participants} {t.teams}</span></p>
      </div>
      <EventPosterStage eventName={identity.title} gameSlug={gameSlug} posterUrl={identity.poster.eventUrl} eyebrow={`${identity.game.name} / ${identity.game.modeName}`} priority />
    </div>
    <PublicV3FactStrip fallback={t.pending} facts={[
      { label: t.starts, value: homeDate(view.facts.startsAt, locale, view.facts.timezone) },
      { label: t.venue, value: view.facts.venue === "TBD" ? null : view.facts.venue },
      { label: t.prize, value: view.facts.prize },
      { label: t.participants, value: view.facts.participantCap > 0 ? `${view.facts.participants} / ${view.facts.participantCap}` : view.facts.participants },
    ]} />
  </section>;
}
