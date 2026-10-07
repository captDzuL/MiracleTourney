// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EventDraftForm } from "./EventDraftForm";
import { OrganizerContactForm } from "./OrganizerContactForm";
import { PublishReadiness } from "./PublishReadiness";
import { PreviewControls } from "./PreviewControls";
import { PublishedRevisionControls } from "./PublishedRevisionControls";
import { RevisionVisualEditor } from "./RevisionVisualEditor";
import { TOURNAMENT_FORMAT_PRESETS } from "@/lib/tournament/formats/types";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("event editor locale contract", () => {
  it.each(["id", "en"] as const)("localizes the created preview revoke action in %s", async locale => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const createPreview = vi.fn().mockResolvedValue({ status: "created", url: "/preview/token" });
    try {
      await act(async () => root.render(<PreviewControls eventId="event-1" locale={locale} createPreview={createPreview} />));
      await act(async () => (container.querySelector("[data-create-preview]") as HTMLButtonElement).click());
      expect(createPreview).toHaveBeenCalledWith({ eventId: "event-1", locale });
      expect(container.querySelector("a")?.getAttribute("href")).toBe("/preview/token");
      expect(container.querySelector("[data-revoke-preview]")?.textContent).toBe(locale === "id" ? "Cabut tautan" : "Revoke link");
    } finally { await act(async () => root.unmount()); }
  });
  it.each(["id", "en"] as const)("renders draft setup and publication controls entirely in %s", locale => {
    const contact = React.createElement(OrganizerContactForm, { eventId: "event-1", ...{ locale } });
    const review = <><PublishReadiness eventId="event-1" readiness={{ ready: false, incomplete: [{ code: "name", field: "name", section: "identity" }], notices: [] }} {...{ locale }} /><PreviewControls eventId="event-1" locale={locale} /></>;
    const markup = renderToStaticMarkup(<EventDraftForm eventId="event-1" locale={locale} initialDraft={{ name: "", formatConfig: TOURNAMENT_FORMAT_PRESETS.singleElimination }} initialRevision={1} registrationPanel={contact} reviewPanel={review} />);
    for (const label of locale === "en" ? ["Introduce your event.", "Competition format", "Organizer contact", "Private preview", "Continue", "Step 1 of 5"] : ["Kenalkan acara Anda.", "Format kompetisi", "Kontak organizer", "Pratinjau privat", "Lanjut", "Langkah 1 dari 5"]) expect(markup).toContain(label);
    for (const wrong of locale === "en" ? ["Nama event", "Kapasitas tim", "Simpan kontak", "Belum diatur", "pertandingan terencana"] : ["Competition format", "Create preview", "Complete before publishing", "Step 1 of 5"]) expect(markup).not.toContain(wrong);
  });

  it.each(["id", "en"] as const)("renders revision upload and publication controls in %s", locale => {
    const markup = renderToStaticMarkup(<><RevisionVisualEditor eventId="event-1" revisionId="revision-1" locale={locale} /><PublishedRevisionControls eventId="event-1" revisionId="revision-1" publicSlug="cup" locale={locale} workspaceHref={`/${locale}/organizer/events/event-1/overview`} /></>);
    for (const label of locale === "en" ? ["Revision poster", "Upload revision logo", "Update public event"] : ["Poster revisi", "Unggah logo revisi", "Perbarui event publik"]) expect(markup).toContain(label);
    expect(markup).not.toContain(locale === "en" ? "Saya memiliki izin" : "Update public event");
  });
});
