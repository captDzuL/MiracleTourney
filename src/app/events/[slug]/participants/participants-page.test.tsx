import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });

const mocks = vi.hoisted(() => ({
  flag: vi.fn(), event: vi.fn(), teams: vi.fn(), players: vi.fn(), notFound: vi.fn(), directoryProps: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.flag }));
vi.mock("@/lib/platform/repository", () => ({ getPublicEventBySlug: mocks.event, getTeamsForEvent: mocks.teams, getPlayersForTeams: mocks.players }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/components/public-v2/BackToEvent", () => ({ BackToEvent: () => <div>Back to event</div> }));
vi.mock("@/components/v3/public-event/PublicV3DetailFrame", () => ({
  PublicV3DetailFrame: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/TeamAvatar", () => ({ TeamIdentity: ({ name }: { name: string }) => <span>{name}</span> }));
vi.mock("@/components/ui", () => ({
  Section: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DataTable: ({ rows }: { rows: React.ReactNode[][] }) => <table><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>,
}));
vi.mock("@/components/v3/public-event/PublicParticipantsDirectory", () => ({
  PublicParticipantsDirectory: (props: unknown) => { mocks.directoryProps(props); return <div data-testid="directory">Team directory</div>; },
}));

import { renderParticipantsPage } from "./participants-page";

const team = { id: "team-1", name: "Team One", tag: "ONE", logoText: "ONE", logoUrl: null, captainName: "Public Captain", captainEmail: "secret@example.test", captainPhone: "PRIVATE-PHONE" };
const player = { id: "p1", teamId: "team-1", nickname: "Player11", displayName: "UID-123", position: "Forward", email: "player-secret@example.test", contact: "PRIVATE-CONTACT" };

describe("renderParticipantsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.event.mockResolvedValue({ id: "event-1", name: "Test Event" });
    mocks.teams.mockResolvedValue([team]);
    mocks.players.mockResolvedValue([player]);
    mocks.flag.mockReturnValue(true);
  });

  it.each([false, true])("sends only public team and player fields with V3 foundation %j", async (foundation) => {
    mocks.flag.mockImplementation((flag: string) => flag === "adaptive_public_event_v3" || (foundation && flag === "ui_v3_foundation"));
    const html = renderToStaticMarkup(await renderParticipantsPage("test-event"));
    expect(html).toContain("Team directory");
    expect(mocks.flag).toHaveBeenCalledWith("adaptive_public_event_v3");
    expect(mocks.directoryProps).toHaveBeenCalledWith({
      locale: "id",
      teams: [{ id: "team-1", name: "Team One", tag: "ONE", captain: "Public Captain", players: [{ id: "p1", nickname: "Player11", displayName: "UID-123", position: "Forward" }] }],
    });
    expect(html).not.toMatch(/secret|PRIVATE|email|contact|phone/i);
    expect(JSON.stringify(mocks.directoryProps.mock.calls[0][0])).not.toMatch(/secret|PRIVATE|email|contact|phone/i);
  });

  it.each([false, true])("keeps the table fallback when adaptive is off and V3 foundation is %j", async (foundation) => {
    mocks.flag.mockImplementation((flag: string) => foundation && flag === "ui_v3_foundation");
    const html = renderToStaticMarkup(await renderParticipantsPage("test-event", "en"));
    expect(html).toMatch(/<table(?:\s|>)/);
    expect(html).toContain("Player11 (Forward)");
    expect(html).not.toContain("Team directory");
    expect(mocks.directoryProps).not.toHaveBeenCalled();
  });

  it("preserves missing-event handling without loading teams or players", async () => {
    mocks.event.mockResolvedValue(null);
    mocks.notFound.mockImplementation(() => { throw new Error("NOT_FOUND"); });
    await expect(renderParticipantsPage("missing")).rejects.toThrow("NOT_FOUND");
    expect(mocks.teams).not.toHaveBeenCalled();
    expect(mocks.players).not.toHaveBeenCalled();
  });
});
