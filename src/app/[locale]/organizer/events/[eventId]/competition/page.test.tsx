import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ workspacePage: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/competition/workspace-page", () => ({ workspacePage: mocks.workspacePage }));
vi.mock("@/lib/bracket/read", () => ({ readOrganizerSocialBracket: mocks.read }));
import CompetitionPage from "./page";
describe("organizer competition page", () => {
  it("mounts appearance controls beside the authorized competition workspace", async () => {
    mocks.workspacePage.mockResolvedValue(<main>Existing competition workspace</main>);
    mocks.read.mockResolvedValue({ event: { id: "event-1", slug: "event-one", name: "Event One", logoUrl: null, format: "Single Elimination", status: "Ongoing" }, locale: "en", appearance: { backgroundUrl: null, positionX: 50, positionY: 50, overlay: 35 }, matches: [], champion: null, preview: true });
    const props = { params: Promise.resolve({ locale: "en", eventId: "event-1" }) };
    const html = renderToStaticMarkup(await CompetitionPage(props));
    expect(html).toContain("Existing competition workspace");
    expect(html).toContain("Bracket appearance");
    expect(html).toContain("Event bracket preview");
    expect(mocks.read).toHaveBeenCalledWith("event-1", "en");
  });
});
