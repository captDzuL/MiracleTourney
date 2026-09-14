"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type EventPosterStageProps = {
  eventName: string;
  gameSlug?: string | null;
  posterUrl?: string | null;
  posterAlt?: string | null;
  eyebrow?: string;
  variant?: "hero" | "compact";
  priority?: boolean;
  className?: string;
};

function validPosterSource(value?: string | null): string | null {
  const source = value?.trim();
  if (!source || /[\\\s]/.test(source)) return null;
  if (source.startsWith("/") && !source.startsWith("//")) return source;
  try {
    const url = new URL(source);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? source : null;
  } catch { return null; }
}

/** Reset image failures when the consumer switches event or poster. */
export function EventPosterStage(props: EventPosterStageProps) {
  const source = validPosterSource(props.posterUrl);
  return <PosterContent key={`${props.eventName}:${props.gameSlug}:${source}`} {...props} source={source} />;
}

function PosterContent({ eventName, gameSlug, posterAlt, eyebrow, variant = "hero", priority = false, className, source }: EventPosterStageProps & { source: string | null }) {
  const [posterFailed, setPosterFailed] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const showPoster = Boolean(source && !posterFailed);
  const showCharacters = !showPoster && gameSlug === "flashpeak" && !artFailed;
  const loading = priority ? "eager" : "lazy";
  return (
    <figure className={cn("mpv3-poster-stage", `mpv3-poster-stage--${variant}`, showPoster && "mpv3-poster-stage--poster", className)}>
      {showPoster ? (
        <img className="mpv3-event-poster" src={source!} alt={posterAlt?.trim() || eventName} loading={loading} fetchPriority={priority ? "high" : "auto"} onError={() => setPosterFailed(true)} />
      ) : (
        <>
          <div className="mpv3-poster-lines" aria-hidden="true" />
          {showCharacters && <>
            <img className="mpv3-character mpv3-character--first" src="/character-art/roster/midfielder/Kelly.png" alt="" width={2525} height={3500} loading={loading} onError={() => setArtFailed(true)} />
            <img className="mpv3-character mpv3-character--second" src="/character-art/roster/striker/Rafael.png" alt="" width={2227} height={3184} loading={loading} onError={() => setArtFailed(true)} />
          </>}
          <span className="mpv3-poster-brand" aria-hidden="true">MIRACLE</span>
          <figcaption className="mpv3-poster-caption">
            {eyebrow && <span className="mpv3-eyebrow">{eyebrow}</span>}
            <strong>{eventName}</strong>
          </figcaption>
        </>
      )}
    </figure>
  );
}
