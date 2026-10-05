"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { SocialBracketModel } from "@/lib/bracket/types";
import { buildBracketLayout } from "@/lib/bracket/layout";
import { bracketSafeAssetUrl, renderBracketCanvasHtml, renderBracketHeaderHtml } from "@/lib/bracket/markup";
import { BracketPngDownloads } from "./BracketPngDownloads";
import "./social-bracket.css";

type Props = { model: SocialBracketModel; exportHref?: string; showControls?: boolean; exportDisabled?: boolean; exportDisabledMessage?: string };

export function SocialBracketBoard({ model, exportHref, showControls = true, exportDisabled = false, exportDisabledMessage }: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const rounds = useMemo(() => buildBracketLayout(model.matches).rounds, [model.matches]);
  const [activeRound, setActiveRound] = useState(rounds[0]?.key ?? "");
  const selectedRound = rounds.some((round) => round.key === activeRound) ? activeRound : rounds[0]?.key;
  const full = renderBracketCanvasHtml(model);
  const mobile = selectedRound ? renderBracketCanvasHtml(model, selectedRound) : full;
  useEffect(() => {
    const images = Array.from(rootRef.current?.querySelectorAll<HTMLImageElement>("img[data-team-logo]") ?? []);
    const hideBroken = (event: Event) => { (event.currentTarget as HTMLImageElement).hidden = true; };
    for (const image of images) {
      image.addEventListener("error", hideBroken);
      if (image.complete && image.naturalWidth === 0) image.hidden = true;
    }
    return () => { for (const image of images) image.removeEventListener("error", hideBroken); };
  }, [full, mobile]);
  const id = model.locale === "id";
  const background = bracketSafeAssetUrl(model.appearance.backgroundUrl) ?? (model.preview && typeof window !== "undefined" && model.appearance.backgroundUrl?.startsWith(`blob:${window.location.origin}/`) ? model.appearance.backgroundUrl : null);
  const overlay = Math.min(1, Math.max(0, model.appearance.overlay / 100));
  const backgroundStyle = background ? { backgroundImage: `linear-gradient(rgba(9,17,30,${overlay}),rgba(9,17,30,${overlay})),url("${background}")`, backgroundPosition: `${model.appearance.positionX}% ${model.appearance.positionY}%`, backgroundSize: "cover" } : undefined;


  return <section ref={rootRef} className="social-bracket miracle-v3" style={backgroundStyle} aria-label={id ? "Bracket turnamen" : "Tournament bracket"}>
    <div dangerouslySetInnerHTML={{ __html: renderBracketHeaderHtml(model) }} />
    {showControls && rounds.length > 0 ? <div className="sb-toolbar"><div className="sb-round-selector" role="group" aria-label={id ? "Pilih ronde" : "Select round"}>
      {rounds.map((round) => <button key={round.key} type="button" aria-pressed={selectedRound === round.key} onClick={() => setActiveRound(round.key)}>{round.label}</button>)}
    </div>{exportHref || !model.preview ? <BracketPngDownloads model={model} exportHref={exportHref} selectedRound={selectedRound} disabled={exportDisabled} disabledMessage={exportDisabledMessage} /> : null}</div> : null}
    {rounds.length ? <><div className="sb-scroll sb-desktop-scroll" tabIndex={0} aria-label={id ? "Geser bracket" : "Scroll bracket"}><div dangerouslySetInnerHTML={{ __html: full }} /></div><div className="sb-scroll sb-mobile-scroll" tabIndex={0} aria-label={id ? "Ronde terpilih" : "Selected round"}><div dangerouslySetInnerHTML={{ __html: mobile }} /></div></> : <p className="sb-empty">{id ? "Bracket resmi belum tersedia." : "The official bracket is not available yet."}</p>}
  </section>;
}
