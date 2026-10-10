// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompetitionWorkspaceState } from "@/lib/competition/workspace-types";
import { DisqualifyTeamPanel } from "./DisqualifyTeamPanel";
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const boundary = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("@/lib/actions/competition-v3-actions", () => ({ previewCompetitionTeamDisqualificationAction: boundary.preview }));

const state = (over: Partial<CompetitionWorkspaceState> = {}): CompetitionWorkspaceState => ({
  event: { id: "event", name: "Premier Peak", version: 7, timezone: "Asia/Jakarta", startsAt: null, publishedScheduleVersion: 1, config: null },
  graph: null, drawing: null, drawingPublished: true,
  teams: [{ id: "x", name: "Xenon" }, { id: "y", name: "Yara" }, { id: "z", name: "Zeta" }],
  matches: [{ id: "m1", homeTeamId: "x", awayTeamId: "y", homeScore: 0, awayScore: 0, status: "Scheduled", scheduleStatus: "estimated", resultVersion: 0, bestOf: 1, roundLabel: "", phaseId: null, groupId: null, start: null, end: null, room: null, games: [] }],
  standings: [], readiness: [], actions: [], schedule: null, publishedSchedule: null, incidents: [], announcements: [], audit: [], unavailableSections: [],
  ...over,
});
const impact = (over: Record<string, unknown> = {}) => ({
  eventId: "event", teamId: "x", competitionVersion: 7, token: "token-1",
  voidedMatchIds: ["m1"], ignoredResultMatchIds: [], blockers: [], participants: [], standingsBefore: [],
  standings: [{ groupId: "g", phaseId: "p", complete: true, disqualified: ["x"], rows: [{ teamId: "y", played: 1, points: 3, rank: 1, tied: false }, { teamId: "z", played: 1, points: 0, rank: 2, tied: false }] }],
  placements: [], ...over,
});

let host: HTMLDivElement, root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); boundary.preview.mockReset(); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const render = (run = vi.fn().mockResolvedValue(undefined), current = state()) => {
  act(() => root.render(<DisqualifyTeamPanel state={current} teamId="x" locale="en" busy={false} run={run} onClose={() => {}} />));
  return run;
};
const button = (label: string) => Array.from(host.querySelectorAll("button")).find(b => b.textContent === label) as HTMLButtonElement;
const type = async (input: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const click = async (element: HTMLElement) => act(async () => { element.click(); });

describe("DisqualifyTeamPanel", () => {
  it("cannot disqualify before the impact was reviewed", async () => {
    const run = render();
    await type(host.querySelector("input[name=disqualificationReason]")!, "Used a stand-in player");
    expect(button("Disqualify team").disabled).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  it("shows the impact, then submits the previewed token with the reason after confirmation", async () => {
    boundary.preview.mockResolvedValue(impact());
    const run = render();
    await type(host.querySelector("input[name=disqualificationReason]")!, "  Used a stand-in player ");
    await click(button("Review impact"));
    expect(boundary.preview).toHaveBeenCalledWith({ eventId: "event", teamId: "x" });
    expect(host.textContent).toContain("Cancelled upcoming matches: 1");
    expect(host.textContent).toContain("Xenon — Yara");
    expect(host.textContent).toContain("1. Yara");
    expect(button("Disqualify team").disabled).toBe(true); // still needs the confirmation checkbox
    await click(host.querySelector("input[type=checkbox]") as HTMLElement);
    expect(button("Disqualify team").disabled).toBe(false);
    await click(button("Disqualify team"));
    expect(run).toHaveBeenCalledWith({ kind: "team_disqualify", teamId: "x", reason: "Used a stand-in player", previewToken: "token-1" });
  });

  it("blocks confirmation and explains why when the preview reports a blocker", async () => {
    boundary.preview.mockResolvedValue(impact({ blockers: [{ code: "live_match", matchId: "m1", message: "live" }] }));
    render();
    await type(host.querySelector("input[name=disqualificationReason]")!, "joki");
    await click(button("Review impact"));
    expect(host.textContent).toContain("is live: finish or cancel it first");
    expect((host.querySelector("input[type=checkbox]") as HTMLInputElement).disabled).toBe(true);
    expect(button("Disqualify team").disabled).toBe(true);
  });

  it("requires a fresh preview when the competition changed after it was loaded", async () => {
    boundary.preview.mockResolvedValue(impact({ competitionVersion: 6 }));
    render();
    await type(host.querySelector("input[name=disqualificationReason]")!, "joki");
    await click(button("Review impact"));
    expect(host.textContent).toContain("Review the impact again");
    expect(button("Disqualify team").disabled).toBe(true);
  });

  it("does not claim qualification for teams tied across the cutline", async () => {
    boundary.preview.mockResolvedValue(impact({ standings: [{ groupId: "g", phaseId: "p", complete: false, disqualified: ["x"], rows: [
      { teamId: "y", played: 2, points: 6, rank: 1, tied: false }, { teamId: "z", played: 1, points: 0, rank: 2, tied: true }, { teamId: "w", played: 1, points: 0, rank: 2, tied: true }] }] }));
    const graph = { groups: [{ id: "g", phaseId: "p", label: "A", sequence: 1, teams: [], qualificationCutline: 2 }] } as unknown as CompetitionWorkspaceState["graph"];
    render(undefined, state({ graph, teams: [...state().teams, { id: "w", name: "Whisky" }] }));
    await type(host.querySelector("input[name=disqualificationReason]")!, "joki");
    await click(button("Review impact"));
    const lines = Array.from(host.querySelectorAll("ol li")).map(li => li.textContent);
    expect(lines[0]).toContain("qualifies");
    expect(lines[1]).toContain("tied at the cutline");
    expect(lines[1]).not.toContain("qualifies");
    expect(lines[2]).toContain("tied at the cutline");
  });

  it("warns when a group cannot fill its qualifying slots", async () => {
    boundary.preview.mockResolvedValue(impact());
    const graph = { groups: [{ id: "g", phaseId: "p", label: "A", sequence: 1, teams: [], qualificationCutline: 3 }] } as unknown as CompetitionWorkspaceState["graph"];
    render(undefined, state({ graph }));
    await type(host.querySelector("input[name=disqualificationReason]")!, "joki");
    await click(button("Review impact"));
    expect(host.textContent).toContain("Only 2 team(s) remain for 3 qualifying slots");
  });
});
