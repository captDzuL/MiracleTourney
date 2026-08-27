import Image from "next/image";

import { resolveEventVisual, type ResolvableEvent } from "@/lib/platform/event-visual-assets";
import { getGameArtTheme } from "@/lib/platform/config";

export type EventVisualEvent = ResolvableEvent & {
  name: string;
};

export type EventVisualProps = {
  event: EventVisualEvent;
  alt: string;
  /** Set true for the single above-the-fold hero image only. */
  priority?: boolean;
  sizes: string;
  className?: string;
  /**
   * Set true when the surrounding layout already renders the event name as a
   * heading, so the typographic fallback does not duplicate it for assistive tech.
   */
  headingRenderedByCaller?: boolean;
  /**
   * Large, low-opacity watermark number for the typographic poster
   * fallback — the caller's list/issue index, since EventVisual has no
   * notion of its own position among sibling cards.
   */
  ghostNumber?: string;
  /**
   * Adds the rotated game-label chip and a vertical rule down the right edge,
   * mimicking a poster frame. Intended for the single hero/featured visual
   * on a page, not repeated across every card in a listing.
   */
  framed?: boolean;
};

function getEventInitials(name: string) {
  const words = name
    .split(/[\s\-–—/]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

  if (words.length === 0) return "ML";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function getGameLabel(gameId: string) {
  return getGameArtTheme(gameId).label;
}

export function EventVisual({
  event,
  alt,
  priority = false,
  sizes,
  className,
  headingRenderedByCaller = false,
  ghostNumber,
  framed = false,
}: EventVisualProps) {
  const visual = resolveEventVisual(event);
  const wrapperClassName = ["event-visual", framed ? "event-visual--framed" : null, className]
    .filter(Boolean)
    .join(" ");
  // An approved EventVisualAsset has been through organizer review; a bare
  // legacy `gameImageUrl` has not. Only the latter gets the poster-matching
  // photo treatment — reviewed artwork keeps its true colour.
  const isReviewedAsset =
    event.activeVisualAsset?.status === "approved" && event.activeVisualAsset.url === visual.url;

  if (visual.url) {
    const objectPosition = `${visual.focalPoint.x * 100}% ${visual.focalPoint.y * 100}%`;

    return (
      <div className={wrapperClassName} data-event-art-source={visual.source}>
        <Image
          src={visual.url}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes}
          className={["event-visual__image", isReviewedAsset ? null : "event-visual__image--legacy"]
            .filter(Boolean)
            .join(" ")}
          style={{ objectFit: "cover", objectPosition }}
        />
        {framed ? (
          <span className="event-visual__chip" aria-hidden="true">
            {getGameLabel(event.gameId)}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`${wrapperClassName} event-visual--typographic`}
      data-event-art-source={visual.source}
      style={{
        ["--event-accent" as string]: visual.accentColor,
        ["--event-gradient" as string]: getGameArtTheme(event.gameId).bg,
      }}
    >
      {ghostNumber ? (
        <span className="event-visual__ghost-number" aria-hidden="true">
          {ghostNumber}
        </span>
      ) : null}

      {framed ? (
        <span className="event-visual__chip" aria-hidden="true">
          {getGameLabel(event.gameId)}
        </span>
      ) : null}

      <span className="event-visual__initials" aria-hidden="true">
        {getEventInitials(event.name)}
      </span>
      <span className="event-visual__game" aria-hidden="true">
        {getGameLabel(event.gameId)}
      </span>

      {headingRenderedByCaller ? null : <span className="sr-only">{event.name}</span>}
    </div>
  );
}
