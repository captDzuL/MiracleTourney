import { resolvePublicV3Route, type PublicV3EventViewModel, type PublicV3Locale } from "@/lib/events/public-v3-types";
import { homeCopy, homeDate, homeStatusExplanation } from "./home-copy";
import { PublicV3Eyebrow } from "./PublicV3Primitives";

export function EventPulse({ view, locale }: { view: PublicV3EventViewModel; locale: PublicV3Locale }) {
  const t = homeCopy[locale];
  const next = view.mode === "ongoing" ? view.nextMatches[0] : view.mode === "drawing" ? view.matches[0] : undefined;
  const teamName = (value: string | null) => view.teams.find((team) => team.id === value)?.name ?? value ?? t.pending;
  const champion = view.mode === "finished" ? view.podium.find((entry) => entry.rank === 1) : undefined;
  const title = next ? `${t.next}: ${teamName(next.home)} vs ${teamName(next.away)}` : champion ? `${t.champion}: ${champion.teamName}` : view.mode === "registration" ? `${view.registration.remainingSlots} ${t.slots}` : view.mode === "drawing" ? (view.drawing.published ? t.drawingReady : t.drawingPending) : view.mode === "finished" ? t.resultsPending : t.noNext;
  return <section data-event-pulse className="mpv3-pulse-strip" aria-label="Event Pulse">
    <h2 className="mpv3-pulse-title"><span className="mpv3-dot" aria-hidden="true" />Event Pulse</h2>
    <div className="mpv3-pulse-item"><PublicV3Eyebrow>{view.identity.game.name} · {view.identity.game.modeName}</PublicV3Eyebrow><p data-status-key={view.statusExplanationKey}>{homeStatusExplanation(view, locale)}</p></div>
    <a className="mpv3-pulse-item" href={resolvePublicV3Route(next ? view.identity.routes.schedule : view.identity.routes.overview, locale)}><strong>{title}</strong><p>{next ? homeDate(next.start, locale, view.facts.timezone) : t.explore} <span aria-hidden="true">↗</span></p></a>
  </section>;
}
