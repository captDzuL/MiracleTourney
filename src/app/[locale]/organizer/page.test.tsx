// @vitest-environment jsdom
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const { requireAnyRole, getManageableEventsForUser, getTeamCountsForEvents, getOrganizerProfileForUser, getActiveEventEditRevisionIds, isFeatureEnabled, notFound, redirectToActiveLocale } = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  getManageableEventsForUser: vi.fn(),
  getTeamCountsForEvents: vi.fn(),
  getOrganizerProfileForUser: vi.fn(),
  getActiveEventEditRevisionIds: vi.fn(),
  isFeatureEnabled: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  redirectToActiveLocale: vi.fn(() => { throw new Error("REDIRECT"); }),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled }));
vi.mock("@/lib/events/event-revision", () => ({ getActiveEventEditRevisionIds }));
vi.mock("@/lib/platform/repository", () => ({ getManageableEventsForUser, getTeamCountsForEvents, getOrganizerProfileForUser }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, locale, ...props }: { href: string; children: React.ReactNode; locale?: string }) => <a {...props} href={locale ? `/${locale}${href}` : href}>{children}</a>,
}));

import OrganizerCommandCenterPage from "./page";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import id from "../../../../messages/id.json";

vi.mock("next-intl/server", () => ({ getTranslations: async ({ locale, namespace }: { locale: "id" | "en"; namespace: "organizerMaster" }) => createTranslator({ locale, messages: locale === "id" ? id : en, namespace }) }));

const events = [
  { id: "draft-1", name: "Miracle Draft Cup", status: "Draft", participantCap: 16, format: "Single Elimination", gameId: "flashpeak" },
  { id: "live-1", name: "Kuroko Community League", status: "Published", participantCap: 8, format: "League", gameId: "kuroko" },
];

describe("organizer command center", () => {
  it.each(["id", "en"] as const)("searches the native lifecycle-grouped selector in %s", async locale => {
    isFeatureEnabled.mockReturnValue(true);
    getManageableEventsForUser.mockResolvedValue([...events, { ...events[1], id: "finished-1", name: "Final Cup", status: "Finished" }]);
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      const page = await OrganizerCommandCenterPage({ params: Promise.resolve({ locale }) });
      await React.act(async () => root.render(page));
      expect(container.querySelector("details > summary")?.textContent).toBe(locale === "id" ? "Pilih acara" : "Choose event");
      const search = container.querySelector('input[type="search"]') as HTMLInputElement;
      expect(search).not.toBeNull();
      expect(container.querySelector(`label[for="${search.id}"]`)?.textContent).toBe(locale === "id" ? "Cari acara" : "Search events");
      expect([...container.querySelectorAll("details section")].map(section => section.getAttribute("aria-label"))).toEqual(locale === "id" ? ["Draf", "Registrasi", "Selesai"] : ["Draft", "Registration", "Finished"]);
      await React.act(async () => { search.value = "  KUROKO  "; search.dispatchEvent(new Event("input", { bubbles: true })); });
      expect(container.querySelectorAll("details nav a")).toHaveLength(1);
      expect(container.querySelector("details nav a")?.getAttribute("href")).toBe(`/${locale}/organizer/events/live-1/overview`);
      await React.act(async () => { search.value = "unmatched"; search.dispatchEvent(new Event("input", { bubbles: true })); });
      expect(container.querySelectorAll("details nav a")).toHaveLength(0);
      expect(container.querySelector('details [role="status"]')?.textContent).toBe(locale === "id" ? "Tidak ada acara yang cocok." : "No matching events.");
      await React.act(async () => { search.value = ""; search.dispatchEvent(new Event("input", { bubbles: true })); });
      expect(container.querySelectorAll("details nav a")).toHaveLength(3);
    } finally { await React.act(async () => root.unmount()); }
  });

  it.each(["Published", "Registration Closed"])("keeps a start-edit action for %s without a revision", async status => {
    isFeatureEnabled.mockReturnValue(true);
    getManageableEventsForUser.mockResolvedValue([{ ...events[1], status }]);
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(await OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "en" }) })), "text/html");
    expect(doc.querySelector('article a[href="/en/organizer/events/live-1/edit"]')?.textContent).toBe("Edit event");
  });

  it.each([["Registration Closed", "competition_operations_v3", "competition"], ["Ongoing", "competition_operations_v3", "match-control"], ["Finished", "completion_workspace_v3", "completion"]])("does not offer unavailable %s operations", async (status, disabledFlag, section) => {
    isFeatureEnabled.mockImplementation((flag: string) => flag !== disabledFlag);
    getManageableEventsForUser.mockResolvedValue([{ ...events[1], status }]);
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(await OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "en" }) })), "text/html");
    expect(doc.querySelector(`article a[href$="/${section}"]`)).toBeNull();
    expect(doc.querySelector("article [aria-disabled=true]")?.textContent).toContain("currently unavailable");
  });

  it.each([
    ["en", "double_elimination", "Double elimination"], ["en", "group_playoffs", "Groups and playoffs"], ["en", "round_robin", "Round robin"],
    ["id", "double_elimination", "Eliminasi ganda"], ["id", "group_playoffs", "Grup dan playoff"], ["id", "round_robin", "Sistem liga"],
  ])("uses authoritative %s %s format labels", async (locale, kind, label) => {
    isFeatureEnabled.mockReturnValue(true);
    getManageableEventsForUser.mockResolvedValue([{ ...events[1], format: "Single Elimination", formatConfig: { kind } }]);
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(await OrganizerCommandCenterPage({ params: Promise.resolve({ locale }) })), "text/html");
    expect(doc.querySelector("article")?.textContent).toContain(label);
  });

  it("uses legacy format only when authoritative configuration is absent", async () => {
    isFeatureEnabled.mockReturnValue(true);
    getManageableEventsForUser.mockResolvedValue([{ ...events[1], formatConfig: null }]);
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(await OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "en" }) })), "text/html");
    expect(doc.querySelector("article p")?.textContent).toContain("League");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    isFeatureEnabled.mockImplementation((flag: string) => flag !== "organizer_master_shell_v3");
    requireAnyRole.mockResolvedValue({ id: "org-1", role: "organizer", name: "Miracle Organizer" });
    getManageableEventsForUser.mockResolvedValue(events);
    getTeamCountsForEvents.mockResolvedValue(new Map([["draft-1", 4], ["live-1", 8]]));
    getActiveEventEditRevisionIds.mockResolvedValue({});
    getOrganizerProfileForUser.mockResolvedValue({ organizationName: "Miracle Esports", contactChannel: "WhatsApp", contactValue: "+628123456789", verified: false });
  });

  it.each([
    ["Draft", "edit", "Continue setup"],
    ["Published", "registration", "Manage registration"],
    ["Registration Closed", "competition", "Prepare competition"],
    ["Ongoing", "match-control", "Open Match Control"],
    ["Finished", "completion", "Review completion"],
  ])("routes %s to the next lifecycle action", async (status, section, label) => {
    isFeatureEnabled.mockReturnValue(true);
    getManageableEventsForUser.mockResolvedValue([{ ...events[0], status, gameId: "game-flashpeak" }]);
    const markup = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={en}>{await OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "en" }) })}</NextIntlClientProvider>);
    const card = new DOMParser().parseFromString(markup, "text/html").querySelector("article")!;
    expect(card.querySelector("a")?.getAttribute("href")).toBe(`/en/organizer/events/draft-1/${section}`);
    expect(card.querySelector("a")?.textContent).toBe(label);
    expect(markup).toContain("Flashpeak");
    expect(markup).not.toContain("game-flashpeak");
    expect(markup).not.toContain("�");
  });

  it("renders Indonesian inventory, accessible event selection and revision work without changing the primary lifecycle action", async () => {
    isFeatureEnabled.mockReturnValue(true);
    getManageableEventsForUser.mockResolvedValue([{ ...events[1], gameId: "game-kuroko", slug: "kuroko-cup" }]);
    getActiveEventEditRevisionIds.mockResolvedValue({ "live-1": { id: "rev-1", revision: 2 } });
    const markup = renderToStaticMarkup(await OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "id" }) }));
    const document = new DOMParser().parseFromString(markup, "text/html");
    expect(document.querySelector("h1")?.textContent).toBe("Pusat Kendali Organizer");
    expect(document.querySelector("details > summary")?.textContent).toBe("Pilih acara");
    expect(document.querySelector("details nav a")?.getAttribute("href")).toBe("/id/organizer/events/live-1/overview");
    expect(document.querySelector("article a")?.getAttribute("href")).toBe("/id/organizer/events/live-1/registration");
    expect(document.querySelector("article")?.textContent).toContain("Kuroko no Basket Street Rival");
    expect(document.querySelector("article")?.textContent).toContain("Lanjutkan revisi");
    expect(markup).not.toContain("Organizer Command Center");
    expect(markup).not.toContain("�");
  });

  it("shows a truthful empty inventory and no fabricated event links", async () => {
    isFeatureEnabled.mockReturnValue(true);
    getManageableEventsForUser.mockResolvedValue([]);
    const markup = renderToStaticMarkup(await OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "en" }) }));
    const document = new DOMParser().parseFromString(markup, "text/html");
    expect(document.querySelectorAll("article")).toHaveLength(0);
    expect(document.querySelectorAll("details a")).toHaveLength(0);
    expect(markup).toContain("No events yet.");
    expect(markup).toContain('href="/en/organizer/events/new"');
  });

  it("requires password change before loading event inventory", async () => {
    isFeatureEnabled.mockReturnValue(true);
    requireAnyRole.mockResolvedValue({ id: "org-1", role: "organizer", mustChangePassword: true });
    await expect(OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "en" }) })).rejects.toThrow("REDIRECT");
    expect(redirectToActiveLocale).toHaveBeenCalledWith("/organizer/change-password");
    expect(getManageableEventsForUser).not.toHaveBeenCalled();
  });

  it("shows only the organizer's event inventory, priority draft work, and workspace links", async () => {
    const markup = renderToStaticMarkup(await OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "id" }) }));
    expect(requireAnyRole).toHaveBeenCalledWith(["organizer"]);
    expect(getManageableEventsForUser).toHaveBeenCalledWith(expect.objectContaining({ id: "org-1" }));
    expect(getTeamCountsForEvents).toHaveBeenCalledWith(["draft-1", "live-1"]);
    expect(markup).toContain("Organizer Command Center");
    expect(markup).toContain("Miracle Draft Cup");
    expect(markup).toContain("Lanjutkan setup");
    expect(markup).toContain('href="/organizer/events/draft-1/overview"');
    expect(markup).toContain('href="/organizer/events/new"');
    expect(markup).toContain("Edit event");
    expect(markup).toContain('href="/organizer/events/live-1/edit"');
    expect(markup).toContain("Kelola registrasi");
    expect(markup).toContain('href="/organizer/events/draft-1/registration"');
    expect(markup).toContain('href="/organizer/events/live-1/registration"');
    expect(markup).toContain("Miracle Esports");
  });


  it("shows Continue revision when a private revision is active", async () => {
    getActiveEventEditRevisionIds.mockResolvedValue({ "live-1": { id: "revision-1", revision: 2 } });
    const markup = renderToStaticMarkup(await OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "id" }) }));
    expect(markup).toContain("Lanjutkan revisi");
    expect(markup).toContain("Revisi privat aktif");
  });

  it("preserves the database-free organizer landing page when the V3 flag is off", async () => {
    isFeatureEnabled.mockReturnValue(false);
    const markup = renderToStaticMarkup(await OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "id" }) }));
    expect(markup).toContain("Buat turnamen yang hasilnya rapi sampai selesai.");
    expect(markup).toContain('href="/login"');
    expect(requireAnyRole).not.toHaveBeenCalled();
  });

  it("requires an organizer session when the V3 flag is on", async () => {
    isFeatureEnabled.mockReturnValue(true);
    requireAnyRole.mockResolvedValue(null);
    await expect(OrganizerCommandCenterPage({ params: Promise.resolve({ locale: "id" }) })).rejects.toThrow("REDIRECT");
  });
});
