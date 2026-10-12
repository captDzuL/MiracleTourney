import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/organizer-roster-change-actions", () => ({
  organizerDecideRosterChangeAction: vi.fn(),
  organizerSetRosterChangeLimitAction: vi.fn(),
}));
vi.mock("@/components/submit-button", () => ({
  SubmitButton: ({ children }: { children: React.ReactNode }) => <button type="submit">{children}</button>,
}));

import type { RosterChangeRequestView, RosterChangeSettings } from "@/lib/platform/roster-change-settings";
import { RosterChangeSettingsError, RosterChangeSettingsPanel } from "./RosterChangeSettingsPanel";

const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}(${Object.entries(values).map(([name, value]) => `${name}=${value}`).join(",")})` : key;

const request = (overrides: Partial<RosterChangeRequestView> = {}): RosterChangeRequestView => ({
  id: "request-1", teamId: "team-1", teamName: "Redclover", kind: "swap", status: "pending", createdAt: new Date("2026-10-11T00:00:00Z"),
  note: null, decisionNote: null, returning: false, activeElsewhere: [], teamUsed: 1,
  outgoing: { displayName: "UID-b", nickname: "Bee", position: "Guard" },
  incoming: { displayName: "UID-new", nickname: "NewGuy", position: "Defender" },
  ...overrides,
});
const settings = (overrides: Partial<RosterChangeSettings> = {}): RosterChangeSettings => ({
  limit: 2, maxLimit: 5, formatSupported: true, window: "limited", pending: [], recent: [], ...overrides,
});
const render = (value: RosterChangeSettings, extra: { result?: string; error?: string } = {}) =>
  renderToStaticMarkup(<RosterChangeSettingsPanel eventId="event-1" settings={value} t={t} {...extra} />);

describe("RosterChangeSettingsPanel: limit", () => {
  it("shows the current limit in a form posted with the event id", () => {
    const html = render(settings());
    expect(html).toContain('name="eventId" value="event-1"');
    expect(html).toMatch(/name="limit"[^>]*value="2"|value="2"[^>]*name="limit"/);
    expect(html).toContain('max="5"');
    expect(html).toContain("window.limited");
  });
  it("explains that other formats cannot use the feature and disables the input", () => {
    const html = render(settings({ formatSupported: false, limit: 0, window: "locked" }));
    expect(html).toContain("unsupported");
    expect(html).toMatch(/<input[^>]*name="limit"[^>]*disabled|<input[^>]*disabled[^>]*name="limit"/);
  });
});

describe("RosterChangeSettingsPanel: waiting requests", () => {
  it("says so when nothing waits", () => {
    expect(render(settings())).toContain("noPending");
  });

  it("shows who leaves, who joins, the team and its usage, with approve and reject buttons", () => {
    const html = render(settings({ pending: [request()] }));
    expect(html).toContain("Redclover");
    expect(html).toContain("kind.swap");
    expect(html).toContain("Bee");
    expect(html).toContain("UID-b");
    expect(html).toContain("NewGuy");
    expect(html).toContain("UID-new");
    expect(html).toContain("usage(used=1,limit=2)");
    expect(html).toContain('name="requestId" value="request-1"');
    expect(html).toMatch(/<button[^>]*name="decision"[^>]*value="approve"|<button[^>]*value="approve"[^>]*name="decision"/);
    expect(html).toMatch(/<button[^>]*name="decision"[^>]*value="reject"|<button[^>]*value="reject"[^>]*name="decision"/);
    expect(html).toContain('name="note"');
  });

  it("keeps the note out of the default-submit path: Enter must never approve a request", () => {
    const html = render(settings({ pending: [request()] }));
    // A text input would submit the form with the first button (Approve) when Enter is pressed.
    expect(html).toMatch(/<textarea[^>]*name="note"/);
    expect(html).not.toMatch(/<input[^>]*name="note"/);
  });

  it("flags a UID that another team fields right now", () => {
    const html = render(settings({ pending: [request({ activeElsewhere: ["Blue Fox", "Red Wolf"] })] }));
    expect(html).toContain("alsoOn(teams=Blue Fox, Red Wolf)");
  });

  it("flags a former player coming back", () => {
    expect(render(settings({ pending: [request({ returning: true })] }))).toContain("returning");
  });

  it("handles add and remove requests that have only one side", () => {
    const add = render(settings({ pending: [request({ kind: "add", outgoing: null })] }));
    expect(add).toContain("kind.add");
    expect(add).toContain("NewGuy");
    const remove = render(settings({ pending: [request({ kind: "remove", incoming: null })] }));
    expect(remove).toContain("kind.remove");
    expect(remove).toContain("Bee");
  });

  it("escapes player-controlled text", () => {
    const html = render(settings({ pending: [request({ incoming: { displayName: "<b>x</b>", nickname: "<img src=x onerror=alert(1)>", position: "" } })] }));
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});

describe("RosterChangeSettingsPanel: recent decisions", () => {
  it("lists them with status and the organizer's reason", () => {
    const html = render(settings({ recent: [request({ status: "rejected", decisionNote: "Belum terdaftar" })] }));
    expect(html).toContain("recentTitle");
    expect(html).toContain("status.rejected");
    expect(html).toContain("Belum terdaftar");
  });
});

describe("RosterChangeSettingsPanel: notices", () => {
  it("confirms a known result", () => {
    expect(render(settings(), { result: "approved" })).toContain("result.approved");
  });
  it("shows a known error code in translated form", () => {
    expect(render(settings(), { error: "window_closed" })).toContain("error.window_closed");
  });
  it("never reflects an unknown code from the address bar", () => {
    const html = render(settings(), { error: "<script>alert(1)</script>", result: "hacked" });
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("hacked");
    expect(html).toContain("error.unknown");
  });
});

describe("RosterChangeSettingsError", () => {
  it("tells the organizer the panel could not load instead of vanishing", () => {
    const html = renderToStaticMarkup(<RosterChangeSettingsError t={t} />);
    expect(html).toContain("title");
    expect(html).toContain("loadFailed");
    expect(html).toContain('role="alert"');
  });
});
