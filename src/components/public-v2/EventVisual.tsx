import Image from "next/image";

import { resolveEventVisual, type ResolvableEvent } from "@/lib/platform/event-visual-assets";
import { games } from "@/lib/platform/config";

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
  const game = games.find((item) => item.id === gameId);
  return game?.artTheme?.label ?? game?.name ?? "MIRACLE";
}

export function EventVisual({
  event,
  alt,
  priority = false,
  sizes,
  className,
  headingRenderedByCaller = false,
}: EventVisualProps) {
  const visual = resolveEventVisual(event);
  const wrapperClassName = ["event-visual", className].filter(Boolean).join(" ");

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
          className="event-visual__image"
          style={{ objectFit: "cover", objectPosition }}
        />
      </div>
    );
  }

  return (
    <div
      className={`${wrapperClassName} event-visual--typographic`}
      data-event-art-source={visual.source}
      style={{ ["--event-accent" as string]: visual.accentColor }}
    >
      <svg
        className="event-visual__court"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M-10 78 L58 -10" />
        <path d="M14 110 L92 8" />
        <path d="M48 112 L118 26" />
      </svg>

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
