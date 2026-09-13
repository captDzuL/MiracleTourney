"use client";
import React from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/v3/Button";
export function WorkspaceLoading() {
  const { locale } = useParams();
  return <section role="status" aria-busy="true" className="min-h-48 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-[var(--color-text)]">{locale === "id" ? "Memuat Match Day…" : "Loading Match Day…"}</section>;
}
export function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale } = useParams();
  return <section className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-[var(--color-text)]"><p role="alert" className="mb-4">{locale === "id" ? "Match Day belum dapat dimuat. Coba lagi." : "Match Day could not load. Please retry."}</p><Button onClick={reset}>{locale === "id" ? "Coba lagi" : "Retry"}</Button></section>;
}
