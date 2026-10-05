"use client";

import React, { useState } from "react";
import type { SocialBracketModel } from "@/lib/bracket/types";
import "./social-bracket.css";

type Props = {
  model: Pick<SocialBracketModel, "event" | "locale">;
  exportHref?: string;
  selectedRound?: string;
  rounds?: Array<{ key: string; label: string }>;
  disabled?: boolean;
  disabledMessage?: string;
};

export function BracketPngDownloads({ model, exportHref, selectedRound, rounds, disabled = false, disabledMessage }: Props) {
  const [download, setDownload] = useState<{ kind: "full" | "round" | null; message: string | null }>({ kind: null, message: null });
  const [activeRound, setActiveRound] = useState(rounds?.[0]?.key ?? "");
  const id = model.locale === "id";
  const chosenRound = selectedRound ?? (rounds?.some(round => round.key === activeRound) ? activeRound : rounds?.[0]?.key);
  const baseHref = exportHref ?? `/api/events/${encodeURIComponent(model.event.slug)}/bracket.png?locale=${model.locale}`;
  const roundHref = chosenRound ? `${baseHref}${baseHref.includes("?") ? "&" : "?"}round=${encodeURIComponent(chosenRound)}` : baseHref;

  async function downloadPng(kind: "full" | "round") {
    if (disabled || download.kind) return;
    const href = kind === "round" ? roundHref : baseHref;
    setDownload({ kind, message: null });
    try {
      const response = await fetch(href, { credentials: "same-origin" });
      if (!response.ok) {
        const code = await response.json().then((value: { code?: string }) => value.code, () => "");
        if (code === "too_large" || response.status === 413) throw new Error(id ? "PNG lengkap terlalu besar. Pilih ronde lalu coba lagi." : "Full PNG is too large. Choose a round and retry.");
        throw new Error(id ? "PNG belum dapat dibuat. Coba lagi." : "PNG could not be prepared. Please retry.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${model.event.slug}-bracket${kind === "round" && chosenRound ? `-${chosenRound.replaceAll(":", "-")}` : ""}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownload({ kind: null, message: id ? "PNG siap diunduh." : "PNG download ready." });
    } catch (error) {
      setDownload({ kind: null, message: error instanceof Error ? error.message : id ? "Unduhan gagal. Coba lagi." : "Download failed. Please retry." });
    }
  }

  return <div>
    {rounds?.length ? <label className="sb-download-round-label">{id ? "Pilih ronde untuk PNG" : "Select round for PNG"}<select aria-label={id ? "Pilih ronde untuk PNG" : "Select round for PNG"} value={chosenRound} onChange={event => setActiveRound(event.target.value)}>{rounds.map(round => <option key={round.key} value={round.key}>{round.label}</option>)}</select></label> : null}
    <div className="sb-downloads">
      <button type="button" disabled={disabled || download.kind !== null} onClick={() => void downloadPng("full")}>{download.kind === "full" ? id ? "Menyiapkan PNG…" : "Preparing PNG…" : id ? "Unduh PNG lengkap" : "Download full PNG"}</button>
      {chosenRound ? <button type="button" disabled={disabled || download.kind !== null} onClick={() => void downloadPng("round")}>{download.kind === "round" ? id ? "Menyiapkan PNG…" : "Preparing PNG…" : id ? "Unduh PNG ronde" : "Download round PNG"}</button> : null}
    </div>
    {disabled && disabledMessage ? <p className="sb-download-message" role="status">{disabledMessage}</p> : null}
    {download.message ? <p className="sb-download-message" role="status" aria-live="polite">{download.message}</p> : null}
  </div>;
}
