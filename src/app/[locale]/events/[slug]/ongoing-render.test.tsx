import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ status: "Ongoing", adaptive: true, fail: false, sessionFail: false }));
vi.stubGlobal("React", React);
vi.mock("next-intl/server", () => ({ setRequestLocale: () => {} }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: async () => { if (boundary.sessionFail) throw new Error("session unavailable"); return null; } }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: (flag: string) => flag === "adaptive_public_event_v3" ? boundary.adaptive : false }));
vi.mock("@/lib/platform/repository", () => ({ getPublicEventBySlug: async () => ({ id: "e", status: boundary.status, name: "Cup", description: "Community </script> event", venue: "Online", organizerName: "Miracle Community", startsAt: "2026-09-12T09:00:00Z", prizePoolLabel: "Rp1.000.000", privateReason: "never public" }), getPublicEventSlugRedirect: async () => null }));
vi.mock("../../../events/[slug]/event-detail-page", () => ({ renderEventDetailPage: () => "legacy" }));
vi.mock("@/lib/events/public-v3-read", () => ({ readPublicV3Event: async () => { if (boundary.fail) throw Error("offline"); return { source: "compatible", mode: "ongoing", identity: { id: "e", slug: "cup", title: "Cup", description: "Community </script> event", game: { id: "game", name: "Mobile Legends", modeId: "mode", modeName: "5v5" }, organizer: { name: "Miracle Community", verified: true, trust: "verified", contactChannel: "", contactValue: "", contactHref: null }, statusExplanation: "compatible", statusExplanationKey: "ongoing.compatible", routes: { overview: { key: "overview", hrefByLocale: { id: "/id/events/cup", en: "/en/events/cup" } }, register: { key: "register", hrefByLocale: { id: "/id/events/cup/register", en: "/en/events/cup/register" } }, participants: { key: "participants", hrefByLocale: { id: "/id/events/cup/participants", en: "/en/events/cup/participants" } }, schedule: { key: "schedule", hrefByLocale: { id: "/id/events/cup/schedule", en: "/en/events/cup/schedule" } }, bracket: { key: "bracket", hrefByLocale: { id: "/id/events/cup/bracket", en: "/en/events/cup/bracket" } }, leaderboard: { key: "leaderboard", hrefByLocale: { id: "/id/events/cup/leaderboards", en: "/en/events/cup/leaderboards" } }, standings: { key: "standings", hrefByLocale: { id: "/id/events/cup/standings", en: "/en/events/cup/standings" } } }, facts: { startsAt: "2026-09-12T09:00:00Z", timezone: "Asia/Jakarta", venue: "Online", prize: "Rp1.000.000", participants: 0, participantCap: 16, remainingSlots: 16 }, cta: { kind: "link", label: "view_live_event", href: "/id/events/cup", hrefByLocale: { id: "/id/events/cup", en: "/en/events/cup" }, enabled: true }, navigation: { overview: true, participants: true, schedule: true, bracket: true, leaderboard: true, targets: {} }, poster: { eventUrl: null, logoUrl: null, gameImageUrl: null }, format: "Single Elimination" }, event: {}, organizer: { name: "Miracle Community", verified: true, trust: "verified", contactChannel: "", contactValue: "", contactHref: null }, facts: { startsAt: "2026-09-12T09:00:00Z", timezone: "Asia/Jakarta", venue: "Online", prize: "Rp1.000.000", participants: 0, participantCap: 16, remainingSlots: 16 }, statusExplanation: "compatible", statusExplanationKey: "ongoing.compatible", cta: { kind: "link", label: "view_live_event", href: "/id/events/cup", hrefByLocale: { id: "/id/events/cup", en: "/en/events/cup" }, enabled: true }, navigation: { overview: true, participants: true, schedule: true, bracket: true, leaderboard: true, targets: {} }, teams: [], updates: [], matches: [], liveMatches: [], nextMatches: [], recentResults: [], schedule: null, standings: [], stream: null, leaderboard: [], stateVersion: "1", lastUpdatedAt: "2026-09-12T09:00:00Z" }; } }));
vi.mock("@/components/v3/public-event/PublicV3EventPage", () => ({ PublicV3EventPage: () => <div data-v3-page /> }));
import Page from "./page";
import { PublicV3EventPage } from "@/components/v3/public-event/PublicV3EventPage";

beforeEach(() => { boundary.status = "Ongoing"; boundary.adaptive = true; boundary.fail = false; boundary.sessionFail = false; });

it("selects the normalized V3 overview on the canonical localized route", async () => {
  const result = await Page({ params: Promise.resolve({ slug: "cup", locale: "id" }) });
  const children = React.Children.toArray((result as React.ReactElement<{ children: React.ReactNode }>).props.children);
  expect(children.some(child => React.isValidElement(child) && child.type === PublicV3EventPage)).toBe(true);
  const script = children.find(child => React.isValidElement<{ type?: string }>(child) && child.type === "script" && child.props.type === "application/ld+json");
  expect(script).toBeDefined();
  const html = renderToStaticMarkup(script);
  const data = JSON.parse(html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>")));
  expect(data).toEqual({ "@context": "https://schema.org", "@type": "SportsEvent", name: "Cup", description: "Community </script> event", location: { "@type": "Place", name: "Online" }, organizer: { "@type": "Organization", name: "Miracle Community" }, sport: "Mobile Legends", startDate: "2026-09-12T09:00:00Z", prize: "Rp1.000.000" });
  expect(html).not.toContain("never public"); expect(html.match(/<\/script>/g)).toHaveLength(1);
});

it("uses the same V3 overview for finished and compatible events", async () => {
  boundary.status = "Finished";
  const result = await Page({ params: Promise.resolve({ slug: "cup", locale: "en" }) });
  const children = React.Children.toArray((result as React.ReactElement<{ children: React.ReactNode }>).props.children);
  expect(children.some(child => React.isValidElement(child) && child.type === PublicV3EventPage)).toBe(true);
});

it.each(["Published", "Registration Closed"] as const)("uses the same V3 overview for %s events", async status => {
  boundary.status = status;
  const result = await Page({ params: Promise.resolve({ slug: "cup", locale: "id" }) });
  const children = React.Children.toArray((result as React.ReactElement<{ children: React.ReactNode }>).props.children);
  expect(children.some(child => React.isValidElement(child) && child.type === PublicV3EventPage)).toBe(true);
});

it.each(["flag-off", "failure"] as const)("keeps the legacy renderer out of the adaptive path for %s", async reason => {
  if (reason === "flag-off") boundary.adaptive = false;
  else boundary.fail = true;
  const result = await Page({ params: Promise.resolve({ slug: "cup", locale: "en" }) });
  if (reason === "flag-off") expect(result).toBe("legacy");
  else expect(React.isValidElement(result) && result.type === PublicV3EventPage).toBe(true);
});

it("continues as an anonymous public overview when the optional session read fails", async () => {
  boundary.sessionFail = true;
  const result = await Page({ params: Promise.resolve({ slug: "cup", locale: "en" }) });
  const children = React.Children.toArray((result as React.ReactElement<{ children: React.ReactNode }>).props.children);
  expect(children.some(child => React.isValidElement(child) && child.type === PublicV3EventPage)).toBe(true);
});
