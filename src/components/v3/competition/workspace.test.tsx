// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOURNAMENT_FORMAT_PRESETS } from "@/lib/tournament/formats/types";
import { generateCompetitionGraph } from "@/lib/tournament/competition";
import type { CompetitionWorkspaceState } from "@/lib/competition/workspace-types";
import { CompetitionWorkspace } from "./CompetitionWorkspace";
import { WorkspaceLoading, WorkspaceError } from "./WorkspaceFeedback";
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
const boundary = vi.hoisted(() => ({ execute: vi.fn(), preview: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/actions/competition-v3-actions", () => ({ mutateCompetitionWorkspaceAction: async (input: unknown) => ({ status: "saved", receipt: await boundary.execute(input) }), previewCompetitionResultCorrectionAction: boundary.preview }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: boundary.refresh }), useParams: () => ({ locale: "id" }) }));
export function fixture(): CompetitionWorkspaceState {
  return { event: { id: "event", name: "Miracle Open", version: 4, timezone: "Asia/Jakarta", startsAt: "2026-09-12T02:00:00.000Z", publishedScheduleVersion: 3, config: TOURNAMENT_FORMAT_PRESETS.singleElimination }, graph: null, teams: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }], matches: [{ id: "match", homeTeamId: "a", awayTeamId: "b", homeScore: 0, awayScore: 0, status: "Scheduled", scheduleStatus: "confirmed", resultVersion: 0, bestOf: 1, roundLabel: "single 1", phaseId: null, groupId: null, start: "2026-09-12T02:00:00.000Z", end: "2026-09-12T02:30:00.000Z", room: "Room A", games: [] }], standings: [], readiness: [], actions: [{ id: "action", matchId: "match", priority: "critical", title: "Missing readiness", detail: null }], schedule: null, publishedSchedule: null, incidents: [], announcements: [], audit: [], unavailableSections: [] };
}
describe("organizer Match Day workspace", () => {
  let root: Root, host: HTMLDivElement, state: CompetitionWorkspaceState;
  const button = (label: string) => Array.from(host.querySelectorAll("button")).find(b => b.textContent?.trim() === label)!;
  const submit = async (name: string) => act(async () => { host.querySelector(`form[aria-label="${name}"]`)!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  const set = (name: string, value: string, scope: ParentNode = host) => act(() => { const field = scope.querySelector<HTMLInputElement>(`[name="${name}"]`)!; Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); field.dispatchEvent(new Event("change", { bubbles: true })); });
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); state = fixture(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); boundary.execute.mockResolvedValue({ version: 5 }); vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => ({ ok: true, json: async () => state }))); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it.each([["en", "Action queue", "Next matches"], ["id", "Antrean tindakan", "Pertandingan berikutnya"]] as const)("renders %s action-first cards and localized match links", (locale, queue, next) => {
    act(() => root.render(<CompetitionWorkspace initialState={state} locale={locale} view="match-control" />));
    expect(host.querySelector("h2")?.textContent).toBe(queue);
    expect(host.textContent).toContain(next);
    expect(host.querySelector(`a[href="/${locale}/organizer/events/event/matches/match"]`)).not.toBeNull();
    expect(host.querySelector("table")).toBeNull();
  });
  it("polls stable at 15s, switches to 5s live, pauses hidden and refreshes on focus", async () => {
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="competition" />));
    await act(async () => vi.advanceTimersByTimeAsync(14999)); expect(fetch).not.toHaveBeenCalled();
    state = { ...state, matches: [{ ...state.matches[0], scheduleStatus: "live" }] };
    await act(async () => vi.advanceTimersByTimeAsync(1)); expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(5000)); expect(fetch).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTimeAsync(30000)); expect(fetch).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => window.dispatchEvent(new Event("focus"))); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("backs off after polling failure and offers retry while keeping the last match state", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="competition" />));
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Connection lost");
    expect(host.textContent).toContain("Alpha");
    await act(async () => vi.advanceTimersByTimeAsync(15000)); expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => button("Retry").click()); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("submits readiness through the versioned server action and refreshes immediately", async () => {
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="match" matchId="match" />));
    await act(async () => button("Alpha: ready").click());
    expect(boundary.execute).toHaveBeenCalledWith(expect.objectContaining({ eventId: "event", expectedVersion: 4, command: { kind: "readiness_update", matchId: "match", teamId: "a", status: "ready" } }));
    expect(boundary.refresh).toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("shows conflicts without automatically replaying the mutation", async () => {
    boundary.execute.mockRejectedValue(new Error("Version conflict: refresh competition state"));
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="id" view="match" matchId="match" />));
    await act(async () => button("Alpha: siap").click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("berubah");
    expect(boundary.execute).toHaveBeenCalledTimes(1);
  });
  it("keeps the same idempotency key when retrying an uncertain mutation", async () => {
    boundary.execute.mockRejectedValueOnce(new Error("Failed to fetch"));
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="match" matchId="match" />));
    await act(async () => button("Alpha: ready").click());
    await act(async () => button("Retry action").click());
    expect(boundary.execute.mock.calls[1][0]).toEqual(boundary.execute.mock.calls[0][0]);
  });
  it("saves schedule preview with event-local overrides and locks before explicit publication", async () => {
    state.schedule = scheduleRevision("reviewed", 4, 30);
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="schedule" />));
    set("windowEnd", "2026-09-12T18:00"); set("override-match", "2026-09-12T10:00");
    set("reason", "Room availability", host.querySelector('form[aria-label="Schedule generation"]')!);
    act(() => host.querySelector<HTMLInputElement>('[name="lock-match"]')!.click());
    await submit("Schedule generation");
    expect(boundary.execute).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ kind: "schedule_save", reason: "Room availability", input: expect.objectContaining({ lockedMatchIds: ["match"], manualOverrides: [{ matchId: "match", roomId: "Room A", start: "2026-09-12T03:00:00.000Z", end: "2026-09-12T03:30:00.000Z" }] }) }) }));
    expect(boundary.execute.mock.calls.some(([r]) => r.command.kind === "schedule_publish")).toBe(false);
  });
  it("disables publication when a preview has conflicts", () => {
    state.schedule = { id: "revision", version: 4, baseMatches: [], draft: { kind: "draft", timezone: "Asia/Jakarta", feasible: false, conflicts: [{ code: "ROOM", matchIds: ["match"], message: "Room overlap" }], warnings: [], assignments: [], affectedMatchIds: [], recalculatedMatchIds: [], impact: [] } };
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="schedule" />));
    expect(button("Publish schedule").disabled).toBe(true); expect(host.textContent).toContain("Room overlap");
  });
  it("previews official correction impact before enabling correction", async () => {
    state.matches[0].resultVersion = 1; state.matches[0].status = "Completed";
    boundary.preview.mockResolvedValue({ token: "review-token", competitionVersion: 4, blockedMatchIds: [], affectedMatchIds: ["final"], participants: [], standings: [], placements: [], schedule: null });
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="match" matchId="match" />));
    set("home-1", "2"); set("away-1", "1"); set("correctionReason", "Verified evidence");
    expect(button("Confirm correction").disabled).toBe(true);
    await act(async () => button("Preview correction").click());
    expect(host.textContent).toContain("final");
    await submit("Official result");
    expect(boundary.execute).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: "result_correct", matchId: "match", games: [{ gameNumber: 1, homeScore: 2, awayScore: 1 }], reason: "Verified evidence", previewToken: "review-token" } }));
  });
  it("renders auxiliary partial failures and empty competition state", () => {
    state.matches = []; state.actions = []; state.unavailableSections = ["audit"];
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="competition" />));
    expect(host.textContent).toContain("No matches yet"); expect(host.textContent).toContain("Some sections could not load");
  });
  it("provides localized loading and recoverable page failure", async () => {
    act(() => root.render(<WorkspaceLoading />));
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Memuat");
    const reset = vi.fn(); act(() => root.render(<WorkspaceError error={new Error("database secret")} reset={reset} />));
    expect(host.querySelector('[role="alert"]')?.textContent).not.toContain("database secret");
    await act(async () => button("Coba lagi").click()); expect(reset).toHaveBeenCalledOnce();
  });
  it("submits start and postponement with explicit reasons", async () => {
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="match" matchId="match" />));
    host.querySelector<HTMLInputElement>('form[aria-label="Start match"] [name="reason"]')!.value = "Organizer verified readiness";
    await submit("Start match");
    expect(boundary.execute.mock.calls[0][0].command).toEqual({ kind: "match_start", matchId: "match", reason: "Organizer verified readiness" });
    host.querySelector<HTMLInputElement>('form[aria-label="Postpone match"] [name="reason"]')!.value = "Network issue";
    await submit("Postpone match");
    expect(boundary.execute.mock.calls[1][0].command).toEqual({ kind: "match_timing", matchId: "match", status: "postponed", reason: "Network issue" });
  });
  it("reports and resolves incidents, drafts then publishes announcements, and displays audit reasons", async () => {
    state.incidents = [{ id: "incident", matchId: "match", kind: "network", description: "Disconnected", resolvedAt: null }];
    state.announcements = [{ id: "notice", title: "Update", body: "Schedule update", status: "draft", urgency: "info" }];
    state.audit = [{ id: "log", matchId: "match", action: "match_timing", reason: "Network issue", actor: "owner", at: "2026-09-12T02:00:00Z" }];
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="match" matchId="match" />));
    set("incidentKind", "network"); set("description", "Disconnected again"); await submit("Report incident");
    expect(boundary.execute.mock.calls[0][0].command).toEqual({ kind: "incident_report", matchId: "match", incidentKind: "network", description: "Disconnected again" });
    host.querySelector<HTMLInputElement>('form[aria-label="Resolve incident"] [name="reason"]')!.value = "Reconnected";
    await submit("Resolve incident");
    expect(boundary.execute.mock.calls[1][0].command).toEqual({ kind: "incident_resolve", incidentId: "incident", reason: "Reconnected" });
    set("title", "Welcome"); set("body", "Players ready");
    host.querySelector<HTMLSelectElement>('form[aria-label="Create announcement"] [name="urgency"]')!.value = "urgent";
    await submit("Create announcement");
    expect(boundary.execute.mock.calls[2][0].command).toEqual({ kind: "announcement_save", title: "Welcome", body: "Players ready", urgency: "urgent" });
    await act(async () => button("Publish announcement").click());
    expect(boundary.execute.mock.calls[3][0].command).toEqual({ kind: "announcement_publish", announcementId: "notice" });
    expect(host.textContent).toContain("Network issue");
  });
  it("requires saving announcement edits before publishing the reviewed draft", async () => {
    state.announcements = [{ id: "notice", title: "Update", body: "Message", status: "draft", urgency: "info" }];
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="competition" />));
    const select = host.querySelector<HTMLSelectElement>('form[aria-label="Edit announcement: Update"] [name="urgency"]')!;
    act(() => { select.value = "urgent"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(button("Publish announcement").disabled).toBe(true);
    await submit("Edit announcement: Update");
    expect(boundary.execute.mock.calls[0][0].command).toEqual({ kind: "announcement_save", announcementId: "notice", title: "Update", body: "Message", urgency: "urgent" });
  });
  it("invalidates a correction preview when scores change and blocks terminal downstream impact", async () => {
    state.matches[0].resultVersion = 1; state.matches[0].status = "Completed";
    boundary.preview.mockResolvedValue({ token: "review-token", competitionVersion: 4, blockedMatchIds: ["live-final"], affectedMatchIds: ["live-final"], participants: [], standings: [], placements: [], schedule: null });
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="match" matchId="match" />));
    set("correctionReason", "Verified"); await act(async () => button("Preview correction").click());
    expect(button("Confirm correction").disabled).toBe(true); expect(host.textContent).toContain("Blocked by live");
    set("home-1", "3"); expect(host.textContent).not.toContain("Correction impact");
  });
  it("keeps saved success separate from a failed refresh and never replaces it with older state", async () => {
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="match" matchId="match" />));
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await act(async () => button("Alpha: ready").click());
    expect(host.textContent).toContain("Saved."); expect(host.textContent).toContain("Connection lost");
    await act(async () => button("Retry").click()); expect(host.textContent).toContain("Revision 5");
    expect(boundary.execute).toHaveBeenCalledOnce();
  });
  it.each([["singleElimination", "Elimination bracket"], ["doubleElimination", "Upper & lower bracket"], ["roundRobin", "Standings"], ["groupPlayoffs", "Qualification cutline"]] as const)("renders format context for %s", (preset, expected) => {
    state.graph = generateCompetitionGraph({ eventId: "event", config: TOURNAMENT_FORMAT_PRESETS[preset], teams: Array.from({ length: 16 }, (_, i) => ({ id: `team-${i}`, seed: i + 1 })) });
    state.event.config = state.graph.config;
    if (preset === "roundRobin" || preset === "groupPlayoffs") state.standings = [{ phaseId: state.graph.phases[0].id, groupId: state.graph.groups[0]?.id ?? null, complete: false, rows: [] }];
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="competition" />));
    expect(host.textContent).toContain(expected);
  });
  it("requires regenerating the schedule after editing reviewed constraints", () => {
    state.schedule = { id: "revision", version: 4, baseMatches: [], draft: { kind: "draft", timezone: "Asia/Jakarta", feasible: true, conflicts: [], warnings: [], assignments: [], affectedMatchIds: [], recalculatedMatchIds: [], impact: [] } };
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="schedule" />));
    expect(button("Publish schedule").disabled).toBe(false);
    set("duration", "45"); expect(button("Publish schedule").disabled).toBe(true);
    expect(host.textContent).toContain("Generate a new preview");
  });
  it("accepts a different event even when its competition version is lower", () => {
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="competition" />));
    state = { ...state, event: { ...state.event, id: "new-event", version: 1 }, teams: [{ id: "a", name: "New Alpha" }, { id: "b", name: "New Beta" }] };
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="competition" />));
    expect(host.textContent).toContain("New Alpha"); expect(host.textContent).toContain("Revision 1");
  });
  function scheduleRevision(id: string, version: number, duration: number): NonNullable<CompetitionWorkspaceState["schedule"]> {
    return { id, version, baseMatches: [], input: { timezone: "Asia/Jakarta", eventWindow: { start: "2026-09-12T02:00:00.000Z", end: "2026-09-12T12:00:00.000Z" }, matchDurationMinutes: duration, bufferMinutes: 7, minimumRestMinutes: 20, rooms: ["Room A", "Room B"] }, draft: { kind: "draft", timezone: "Asia/Jakarta", feasible: true, conflicts: [], warnings: [], assignments: [{ matchId: "match", roomId: "Room A", start: "2026-09-12T02:00:00.000Z", end: "2026-09-12T03:00:00.000Z" }], affectedMatchIds: [], recalculatedMatchIds: [], impact: [] } };
  }
  it("opens published constraints when no actionable draft remains", () => {
    state.publishedSchedule = scheduleRevision("published", 3, 60);
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="schedule" />));
    expect(host.querySelector<HTMLInputElement>('[name="duration"]')!.value).toBe("60");
    expect(host.querySelector<HTMLInputElement>('[name="buffer"]')!.value).toBe("7");
    expect(button("Publish schedule")).toBeUndefined();
  });
  it.each(["draft", "published"] as const)("binds assignment locks to the reviewed %s identity", async status => {
    const source = scheduleRevision("reviewed", status === "draft" ? 4 : 3, 30);
    if (status === "draft") {
      state.schedule = source;
      state.matches[0] = { ...state.matches[0], start: null, end: null, room: null };
    } else state.publishedSchedule = source;
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="schedule" />));
    const lock = host.querySelector<HTMLInputElement>('[name="lock-match"]')!;
    expect(lock.disabled).toBe(false);
    act(() => lock.click());
    await submit("Schedule generation");
    expect(boundary.execute).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 4, command: expect.objectContaining({ input: expect.objectContaining({ sourceRevision: { id: source.id, version: source.version, status }, lockedMatchIds: ["match"] }) }) }));
  });
  it("preserves 45 minute local edits when a 90 minute draft arrives and requires explicit reload", async () => {
    state.schedule = scheduleRevision("draft-a", 4, 30);
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="schedule" />));
    set("duration", "45");
    state = { ...state, event: { ...state.event, version: 5 }, schedule: scheduleRevision("draft-b", 5, 90) };
    await act(async () => button("Refresh").click());
    expect(host.querySelector<HTMLInputElement>('[name="duration"]')!.value).toBe("45");
    expect(button("Publish schedule").disabled).toBe(true);
    expect(host.textContent).toContain("New schedule revision");
    await act(async () => button("Reload schedule").click());
    expect(host.querySelector<HTMLInputElement>('[name="duration"]')!.value).toBe("90");
    expect(button("Publish schedule").disabled).toBe(false);
    await act(async () => button("Publish schedule").click());
    expect(boundary.execute.mock.calls[0][0].command).toEqual({ kind: "schedule_publish", revisionId: "draft-b" });
  });
  it("refreshes pristine schedule values when a newer draft arrives", async () => {
    state.schedule = scheduleRevision("draft-a", 4, 30);
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="schedule" />));
    state = { ...state, event: { ...state.event, version: 5 }, schedule: scheduleRevision("draft-b", 5, 90) };
    await act(async () => button("Refresh").click());
    expect(host.querySelector<HTMLInputElement>('[name="duration"]')!.value).toBe("90");
    expect(button("Publish schedule").disabled).toBe(false);
  });
  it("preserves baseline start and end for a room-only override", async () => {
    state.publishedSchedule = scheduleRevision("published", 3, 60);
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="schedule" />));
    set("room-match", "Room B");
    await submit("Schedule generation");
    expect(boundary.execute.mock.calls[0][0].command.input.manualOverrides).toEqual([{ matchId: "match", roomId: "Room B", start: "2026-09-12T02:00:00.000Z", end: "2026-09-12T03:00:00.000Z" }]);
  });
  it.each([false, true])("handles an incoming official correction from 1 to 0 (dirty inputs: %s)", async dirty => {
    state.matches[0] = { ...state.matches[0], resultVersion: 1, status: "Completed", homeScore: 1, games: [{ gameNumber: 1, homeScore: 1, awayScore: 0 }] };
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="match" matchId="match" />));
    if (dirty) set("home-1", "3");
    state = { ...state, event: { ...state.event, version: 5 }, matches: [{ ...state.matches[0], resultVersion: 2, homeScore: 0, awayScore: 1, games: [{ gameNumber: 1, homeScore: 0, awayScore: 1 }] }] };
    await act(async () => button("Refresh").click());
    if (dirty) {
      expect(host.querySelector<HTMLInputElement>('[name="home-1"]')!.value).toBe("3");
      expect(host.textContent).toContain("Official result changed");
      expect(button("Preview correction").disabled).toBe(true);
      expect(button("Confirm correction").disabled).toBe(true);
      await submit("Official result"); expect(boundary.execute).not.toHaveBeenCalled();
      await act(async () => button("Reload official result").click());
    }
    expect(host.querySelector<HTMLInputElement>('[name="home-1"]')!.value).toBe("0");
    expect(host.querySelector<HTMLInputElement>('[name="away-1"]')!.value).toBe("1");
    expect(button("Preview correction").disabled).toBe(false);
    await act(async () => button("Preview correction").click());
    expect(boundary.preview).toHaveBeenCalledWith({ eventId: "event", matchId: "match", games: [{ gameNumber: 1, homeScore: 0, awayScore: 1 }] });
  });
  it("discards a late correction preview after the edited scores change", async () => {
    state.matches[0] = { ...state.matches[0], resultVersion: 1, status: "Completed" };
    let finish!: (value: unknown) => void;
    boundary.preview.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    act(() => root.render(<CompetitionWorkspace initialState={state} locale="en" view="match" matchId="match" />));
    set("home-1", "1"); set("correctionReason", "Evidence");
    await act(async () => button("Preview correction").click());
    set("home-1", "2");
    await act(async () => finish({ token: "old", competitionVersion: 4, blockedMatchIds: [], affectedMatchIds: [], participants: [], standings: [], placements: [], schedule: null }));
    expect(button("Confirm correction").disabled).toBe(true);
    expect(host.textContent).not.toContain("Correction impact");
  });
});
