import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/captain-roster-change-actions", () => ({
  captainRequestRosterChangeAction: vi.fn(),
  captainCancelRosterChangeAction: vi.fn(),
}));
vi.mock("@/components/submit-button", () => ({
  SubmitButton: ({ children }: { children: React.ReactNode }) => <button type="submit">{children}</button>,
}));

import type { RosterChangeOverview } from "@/lib/platform/roster-change-requests";
import { RosterChangePanel } from "./RosterChangePanel";

const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}(${Object.entries(values).map(([name, value]) => `${name}=${value}`).join(",")})` : key;

const team = { id: "team-1", name: "Redclover" } as never;
const players = [
  { id: "p-a", teamId: "team-1", displayName: "UID-a", nickname: "Ace", position: "Forward" },
  { id: "p-b", teamId: "team-1", displayName: "UID-b", nickname: "Bee", position: "Guard" },
];
const item = (status: string, overrides: Record<string, unknown> = {}) => ({
  id: `r-${status}`, kind: "swap", status, createdAt: new Date("2026-10-11T00:00:00Z"),
  outgoingName: "Bee", incomingName: "NewGuy", decisionNote: null, ...overrides,
});
const overview = (overrides: Partial<RosterChangeOverview> = {}): RosterChangeOverview => ({
  window: "limited", limit: 2, used: 0, remaining: 2, pending: null, history: [], rosterMin: 5, rosterMax: 8, activeCount: 5, ...overrides,
});
const render = (value: RosterChangeOverview) =>
  renderToStaticMarkup(<RosterChangePanel team={team} players={players as never} positionOptions={["Forward", "Guard"]} overview={value} t={t} />);

describe("RosterChangePanel", () => {
  it("renders nothing while the roster is still free to edit", () => {
    expect(render(overview({ window: "free" }))).toBe("");
  });

  it("explains a locked roster and offers no form", () => {
    const html = render(overview({ window: "locked", limit: 0, remaining: 0 }));
    expect(html).toContain("rosterChange.lockedNotice");
    expect(html).not.toContain("<form");
  });

  it("shows the remaining allowance and the request form while limited", () => {
    const html = render(overview());
    expect(html).toContain("rosterChange.limitedNotice");
    expect(html).toContain("rosterChange.allowance(remaining=2,limit=2)");
    expect(html).toContain('name="kind"');
    expect(html).toContain('name="teamId" value="team-1"');
    expect(html).toContain('name="outPlayerId"');
    expect(html).toContain('name="displayName"');
    expect(html).toContain('name="nickname"');
    expect(html).toContain("rosterChange.returnHint");
  });

  it("lists only the players on the roster as candidates to leave", () => {
    const html = render(overview());
    expect(html).toContain('value="p-a"');
    expect(html).toContain('value="p-b"');
  });

  it("replaces the form with the waiting request and a cancel button", () => {
    const html = render(overview({ remaining: 1, pending: item("pending"), history: [item("pending")] }));
    expect(html).toContain("rosterChange.pendingTitle");
    expect(html).toContain("rosterChange.pendingSwap(out=Bee,incoming=NewGuy)");
    expect(html).toContain('name="requestId" value="r-pending"');
    expect(html).not.toContain('name="kind"');
  });

  it("tells the captain when no change is left", () => {
    const html = render(overview({ used: 2, remaining: 0, history: [item("approved"), item("approved")] }));
    expect(html).toContain("rosterChange.allowanceUsedUp");
    expect(html).not.toContain('name="kind"');
    expect(html).toContain("rosterChange.status.approved");
  });

  it("shows the organizer's reason when a request was rejected", () => {
    const html = render(overview({ history: [item("rejected", { decisionNote: "Pemain belum terdaftar" })] }));
    expect(html).toContain("rosterChange.status.rejected");
    expect(html).toContain("Pemain belum terdaftar");
  });

  it("renders a dash when a name is missing instead of crashing", () => {
    const html = render(overview({ history: [item("approved", { outgoingName: null, incomingName: null })] }));
    expect(html).toContain("rosterChange.pendingSwap(out=-,incoming=-)");
  });

  it("escapes player-controlled text", () => {
    const html = render(overview({ history: [item("approved", { incomingName: "<img src=x onerror=alert(1)>" })] }));
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});
