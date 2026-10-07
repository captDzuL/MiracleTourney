import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../../messages/en.json";
import id from "../../../../messages/id.json";

Object.assign(globalThis, { React });
const state = vi.hoisted(() => ({ locale: "en" as "en" | "id", enabled: true, role: "platform_admin" }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: (locale: "en" | "id") => { state.locale = locale; },
  getTranslations: async (namespace: "admin") => createTranslator({ locale: state.locale, messages: state.locale === "en" ? en : id, namespace }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement("a", { href: `/${state.locale}${href}` }, children),
}));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => state.enabled }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: async () => ({ id: "admin-1", name: "Admin", role: state.role }) }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("@/lib/events/event-revision", () => ({ getActiveEventEditRevisionIds: async () => ({}) }));
vi.mock("@/lib/platform/repository", () => ({
  getManageableEventsForUser: async () => [
    { id: "draft-1", name: "Draft Cup", status: "Draft", gameId: "game-flashpeak", format: "League" },
    { id: "published-1", name: "Published Cup", status: "Published", slug: "published-cup", gameId: "game-flashpeak", format: "League" },
  ],
  getPendingStatSubmissionCount: async () => 0, getOrganizerUsers: async () => [], getGameModes: () => [],
  getTeamCountsForEvents: async () => new Map(), getEventBySlug: async () => null, getTeamsForEvents: async () => new Map(),
  getCaptainUsersForAdmin: async () => [], listEventVisualAssets: async () => [],
  getGameForEvent: () => ({ name: "Flashpeak" }),
}));
import LocalizedAdminPage from "./page";

// Inspect the real server composition, then render its event-entry section only.
// Other admin form components are unrelated to the entry-navigation contract.
async function resolvePage(node: React.ReactNode): Promise<React.ReactNode> {
  if (!React.isValidElement(node)) return null;
  if (typeof node.type === "function") {
    const component = node.type as (props: unknown) => React.ReactNode | Promise<React.ReactNode>;
    if (component.name === "OperationsOverview") return node;
    if (component.name === "AdminPage") return resolvePage(await component(node.props));
  }
  for (const child of React.Children.toArray((node.props as { children?: React.ReactNode }).children)) {
    const result = await resolvePage(child);
    if (result) return result;
  }
  return null;
}

describe("localized admin event entry", () => {
  beforeEach(() => { state.enabled = true; state.role = "platform_admin"; });
  it.each(["en", "id"] as const)("opens the canonical event workspace in %s", async locale => {
    const page = await LocalizedAdminPage({ params: Promise.resolve({ locale }) });
    const markup = renderToStaticMarkup(await resolvePage(page));
    expect(markup).toContain(`href="/${locale}/organizer/events/draft-1/overview"`);
    expect(markup).toContain(`href="/${locale}/organizer/events/published-1/overview"`);
    expect(markup).not.toContain("/admin/events/");
  });
  it("retains legacy draft and revision destinations with the master flag off", async () => {
    state.enabled = false;
    const page = await LocalizedAdminPage({ params: Promise.resolve({ locale: "en" }) });
    const markup = renderToStaticMarkup(await resolvePage(page));
    expect(markup).toContain('href="/en/admin/events/draft-1/overview"');
    expect(markup).toContain('href="/en/admin/events/published-1/edit"');
  });
  it("still rejects organizer access to the global admin workspace", async () => {
    state.role = "organizer";
    const page = await LocalizedAdminPage({ params: Promise.resolve({ locale: "en" }) });
    await expect(resolvePage(page)).rejects.toThrow("REDIRECT:/organizer");
  });
});
