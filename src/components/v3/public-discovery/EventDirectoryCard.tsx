import { ArrowRight } from "lucide-react";
import { getPublicDiscoveryStage, type PublicDiscoveryEvent } from "@/lib/events/public-discovery";
import { publicV3RouteTarget, resolvePublicV3Route, type PublicV3Locale } from "@/lib/events/public-v3-types";
import { resolveEventVisual } from "@/lib/platform/event-visual-assets";
import type { Game } from "@/lib/platform/types";
import { EventPosterStage } from "./EventPosterStage";
import { PublicV3Action, PublicV3StatusBadge } from "./PublicV3Primitives";
import { homeCopy, homeDate } from "./home-copy";
import { directoryCopy } from "./directory-copy";

/** Discovery already includes approved imagery and team counts in its batch read. */
export function EventDirectoryCard({ entry, games, locale }: { entry: PublicDiscoveryEvent; games: readonly Game[]; locale: PublicV3Locale }) {
  const t = homeCopy[locale];
  const stage = getPublicDiscoveryStage(entry);
  const game = games.find((game) => game.id === entry.event.gameId);
  const href = resolvePublicV3Route(publicV3RouteTarget(entry.event.slug, "overview"), locale);
  return <article className="mpv3-event-card mpv3-directory-card" data-event-id={entry.event.id}>
    <EventPosterStage eventName={entry.event.name} gameSlug={game?.slug} posterUrl={resolveEventVisual(entry.event).url} variant="compact" eyebrow={game?.name ?? entry.event.gameId} />
    <div className="mpv3-event-card-copy">
      <PublicV3StatusBadge status={stage} label={directoryCopy[locale][stage]} />
      <h3><a href={href}>{entry.event.name}</a></h3>
      <p>{game?.name ?? entry.event.gameId}</p>
      <p>{homeDate(entry.event.startsAt, locale)}</p>
      <p>{entry.teamCount} / {entry.event.participantCap} {t.teams}</p>
      <p>{entry.event.format}</p>
      <PublicV3Action variant="text" href={href}>{t.overview}<ArrowRight aria-hidden="true" /></PublicV3Action>
    </div>
  </article>;
}
