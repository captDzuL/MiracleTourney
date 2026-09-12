import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
Object.assign(globalThis, { React });
const boundary = vi.hoisted(() => ({ read: vi.fn(), enabled: true }));
vi.mock("./workspace-read", () => ({ readCompetitionWorkspace: boundary.read }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => boundary.enabled }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("@/components/v3/competition/CompetitionWorkspace", () => ({ CompetitionWorkspace: () => null }));
import CompetitionPage from "@/app/[locale]/organizer/events/[eventId]/competition/page";
import SchedulePage from "@/app/[locale]/organizer/events/[eventId]/schedule/page";
import MatchControlPage from "@/app/[locale]/organizer/events/[eventId]/match-control/page";
import MatchPage from "@/app/[locale]/organizer/events/[eventId]/matches/[matchId]/page";
import { GET } from "@/app/api/organizer/events/[eventId]/competition/route";
describe("organizer server routes", () => {
  beforeEach(() => { boundary.enabled = true; boundary.read.mockReset(); boundary.read.mockResolvedValue({ event: { id: "event", version: 7 }, matches: [{ id: "match" }], unavailableSections: [] }); });
  it.each([[CompetitionPage, "competition"], [SchedulePage, "schedule"], [MatchControlPage, "match-control"], [MatchPage, "match"]] as const)("loads async localized params for view %s", async (page, view) => {
    const element = await page({ params: Promise.resolve({ locale: "id", eventId: "event", matchId: "match" }) });
    expect(element.props).toMatchObject({ locale: "id", view, initialState: { event: { id: "event", version: 7 } } });
  });
  it("rejects unsupported locale, rollout off and foreign match ids", async () => {
    await expect(CompetitionPage({ params: Promise.resolve({ locale: "fr", eventId: "event" }) })).rejects.toThrow("NOT_FOUND");
    expect(boundary.read).not.toHaveBeenCalled();
    boundary.enabled = false;
    await expect(SchedulePage({ params: Promise.resolve({ locale: "en", eventId: "event" }) })).rejects.toThrow("NOT_FOUND");
    boundary.enabled = true;
    await expect(MatchPage({ params: Promise.resolve({ locale: "en", eventId: "event", matchId: "foreign" }) })).rejects.toThrow("NOT_FOUND");
  });
  it.each([["Unauthorized", "/login"], ["Password change required", "/organizer/change-password"]])("redirects %s sessions", async (error, path) => {
    boundary.read.mockRejectedValue(new Error(error));
    await expect(CompetitionPage({ params: Promise.resolve({ locale: "en", eventId: "event" }) })).rejects.toThrow(`REDIRECT:${path}`);
  });
  it("returns private no-store polling state and does not expose authorization failures", async () => {
    const context = { params: Promise.resolve({ eventId: "event" }) };
    const response = await GET(new Request("https://example.test/api/organizer/events/event/competition"), context);
    expect(response.headers.get("Cache-Control")).toContain("no-store"); expect((await response.json()).event.version).toBe(7);
    boundary.read.mockRejectedValue(new Error("Not authorized"));
    const denied = await GET(new Request("https://example.test"), context);
    expect(denied.status).toBe(403); expect(await denied.text()).not.toContain("version");
  });
});
