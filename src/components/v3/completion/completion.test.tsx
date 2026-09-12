// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../messages/en.json";
import idMessages from "../../../../messages/id.json";
import type { CompletionAwardSummary } from "@/lib/completion/workspace";
import { CompletionWorkspace, type CompletionWorkspaceState } from "./CompletionWorkspace";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: navigation.refresh }) }));

const awards: readonly CompletionAwardSummary[] = [
  {
    award: "mvp",
    metricLabel: "Rating",
    candidates: [{ playerId: "p1", playerName: "Nadia Nyx", teamName: "Garuda Nova", valueLabel: "8.7 rating" }],
    selectedPlayerId: "p1",
    decisionReason: null,
    tied: false,
  },
  {
    award: "top_scorer",
    metricLabel: "Eliminations",
    candidates: [{ playerId: "p2", playerName: "Rizky Volt", teamName: "Vortex ID", valueLabel: "42 eliminations" }],
    selectedPlayerId: "p2",
    decisionReason: null,
    tied: false,
  },
  {
    award: "top_defender",
    metricLabel: "Defensive success",
    candidates: [{ playerId: "p3", playerName: "Fajar Aegis", teamName: "Garuda Nova", valueLabel: "71% success" }],
    selectedPlayerId: "p3",
    decisionReason: null,
    tied: false,
  },
  {
    award: "top_assist",
    metricLabel: "Assists",
    candidates: [
      { playerId: "p4", playerName: "Raka Orbit", teamName: "Phoenix Core", valueLabel: "18 assists" },
      { playerId: "p5", playerName: "Dimas Arc", teamName: "Vortex ID", valueLabel: "18 assists" },
    ],
    selectedPlayerId: null,
    decisionReason: null,
    tied: true,
  },
];

const baseState = {
  event: { id: "event-1", name: "Miracle Open", formatLabel: "Group + Playoffs", matchDayHref: "/en/organizer/events/event-1/matches" },
  version: 4,
  blockers: [{
    code: "ACTIVE_DISPUTE" as const,
    subject: "Dispute D-7 · Grand Final",
    repairHref: "/en/organizer/events/event-1/matches?dispute=D-7",
  }],
  podium: {
    sourceKind: "official_playoff" as const,
    sourceLabel: "Official Grand Final and third-place match",
    locked: false,
    placements: [
      { rank: 1 as const, teamId: "t1", teamName: "Garuda Nova" },
      { rank: 2 as const, teamId: "t2", teamName: "Vortex ID" },
      { rank: 3 as const, teamId: "t3", teamName: "Phoenix Core" },
    ],
  },
  awards,
  certificates: {
    generated: 0,
    total: 7,
    status: "not_generated" as const,
    studioHref: "/en/organizer/events/event-1/certificates",
  },
  publication: {
    status: "draft" as const,
    previewHref: "/en/events/miracle-open",
  },
  audit: {
    lastAction: "none" as const,
    actorLabel: null,
    at: null,
    summary: "No completion action has been committed.",
  },
};

function state(status: CompletionWorkspaceState["status"]): CompletionWorkspaceState {
  if (status === "integration_required") {
    return {
      status,
      event: baseState.event,
      version: null,
      blockers: null,
      podium: { sourceKind: "integration_pending", sourceLabel: null, locked: null, placements: null },
      awards: awards.map(({ award }) => ({ award, metricLabel: null, candidates: null, selectedPlayerId: null, decisionReason: null, tied: null })),
      certificates: { generated: null, total: null, status: "integration_pending", studioHref: null },
      publication: { status: "integration_pending", previewHref: null },
      audit: { lastAction: null, actorLabel: null, at: null, summary: null },
    };
  }
  if (status === "blocked") return { ...baseState, status };
  if (status === "ready") return { ...baseState, status, blockers: [], awards: awards.map((award) => award.award === "top_assist" ? { ...award, selectedPlayerId: "p4", decisionReason: "Higher contribution in wins" } : award) };
  if (status === "completed") return { ...baseState, status, blockers: [], version: 5, podium: { ...baseState.podium, locked: true }, awards: awards.map((award) => award.award === "top_assist" ? { ...award, selectedPlayerId: "p4", decisionReason: "Higher contribution in wins" } : award), certificates: { ...baseState.certificates, generated: 7, status: "ready" }, publication: { ...baseState.publication, status: "ready" }, audit: { lastAction: "completed", actorLabel: "Organizer", at: "2026-09-12T02:00:00.000Z", summary: "Completion version 5 locked." } };
  return { ...baseState, status, blockers: [], version: 6, awards: awards.map((award) => award.award === "top_assist" ? { ...award, selectedPlayerId: "p4", decisionReason: "Higher contribution in wins" } : award), audit: { lastAction: "reopened", actorLabel: "Organizer", at: "2026-09-12T03:00:00.000Z", summary: "Competition reopened for correction." } };
}

function provider(locale: "en" | "id", child: React.ReactNode) {
  return <NextIntlClientProvider locale={locale} messages={locale === "en" ? enMessages : idMessages}>{child}</NextIntlClientProvider>;
}

function staticWorkspace(status: CompletionWorkspaceState["status"], locale: "en" | "id" = "en") {
  return renderToStaticMarkup(provider(locale, <CompletionWorkspace
    completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
    reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
    state={state(status)}
  />));
}

describe("CompletionWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    navigation.refresh.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it.each([
    ["integration_required", "Match Day integration required"],
    ["blocked", "Completion blocked"],
    ["ready", "Ready to complete"],
    ["completed", "Tournament completed"],
    ["reopened", "Tournament reopened"],
  ] as const)("renders the %s state without collapsing it into another status", (status, label) => {
    expect(staticWorkspace(status)).toContain(label);
  });

  it("renders four semantic tabs and keeps one accessible active state", async () => {
    await act(async () => root.render(provider("en", <CompletionWorkspace
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={state("blocked")}
    />)));

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Readiness", "Awards", "E-certificates", "Publication"]);
    expect(tabs.filter((tab) => tab.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(tabs[0].getAttribute("aria-controls")).toBe("completion-panel-readiness");

    await act(async () => tabs[1].click());
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[role="tabpanel"]:not([hidden])')?.id).toBe("completion-panel-awards");
    expect(container.querySelector('[role="tabpanel"]:not([hidden])')?.textContent).toContain("Raka Orbit");

    tabs[1].focus();
    await act(async () => tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement).toBe(tabs[2]);
    expect(tabs[2].getAttribute("aria-selected")).toBe("true");
  });

  it("opens each tab's real content panel", async () => {
    await act(async () => root.render(provider("en", <CompletionWorkspace
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={state("blocked")}
    />)));
    const expectations = [
      ["readiness", "Completion readiness"],
      ["awards", "Individual award review"],
      ["certificates", "E-certificate readiness"],
      ["publication", "Publication readiness"],
    ] as const;

    for (const [name, content] of expectations) {
      const tab = container.querySelector<HTMLButtonElement>(`#completion-tab-${name}`)!;
      await act(async () => tab.click());
      const panel = container.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;
      expect(panel.id).toBe(`completion-panel-${name}`);
      expect(panel.textContent).toContain(content);
    }
  });

  it("names the blocker and provides exactly one repair link for the actionable failure", () => {
    const host = document.createElement("div");
    host.innerHTML = staticWorkspace("blocked");
    const blocker = host.querySelector('[data-blocker="ACTIVE_DISPUTE"]')!;
    expect(blocker.textContent).toContain("Dispute D-7 · Grand Final");
    expect(blocker.textContent).toContain("Resolve the active dispute before completion.");
    expect(blocker.querySelectorAll('a[href="/en/organizer/events/event-1/matches?dispute=D-7"]')).toHaveLength(1);
  });

  it("shows every tied award candidate, the source metric, and the audit-reason requirement", async () => {
    await act(async () => root.render(provider("en", <CompletionWorkspace
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={state("blocked")}
    />)));
    await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click());

    const award = container.querySelector('[data-award="top_assist"]')!;
    expect(award.textContent).toContain("Assists");
    expect(award.textContent).toContain("Raka Orbit");
    expect(award.textContent).toContain("Dimas Arc");
    expect(award.textContent).toContain("2 candidates share the top value");
    expect(award.textContent).toContain("An audit reason is required before selecting a winner.");
    expect(award.querySelector('[role="radiogroup"]')?.getAttribute("aria-label")).toContain("Top Assist");
  });

  it("labels podium source and lock state in text instead of color alone", () => {
    expect(staticWorkspace("blocked")).toContain("Official Grand Final and third-place match");
    expect(staticWorkspace("blocked")).toContain("Draft podium");
    expect(staticWorkspace("completed")).toContain("Locked podium");
  });

  it("disables completion around integration and blockers, then enables only the valid state controls", () => {
    const controlState = (status: CompletionWorkspaceState["status"]) => {
      const host = document.createElement("div");
      host.innerHTML = staticWorkspace(status);
      return {
        complete: host.querySelector<HTMLButtonElement>("[data-complete-tournament]")!,
        reopen: host.querySelector<HTMLButtonElement>("[data-reopen-tournament]")!,
      };
    };

    expect(controlState("integration_required").complete.disabled).toBe(true);
    expect(controlState("blocked").complete.disabled).toBe(true);
    expect(controlState("ready").complete.disabled).toBe(false);
    expect(controlState("ready").reopen.disabled).toBe(true);
    expect(controlState("completed").complete.disabled).toBe(true);
    expect(controlState("completed").reopen.disabled).toBe(false);
  });

  it("repairs a missing tied award decision through an organizer selection and nonblank audit reason", async () => {
    const readyState = state("ready");
    if (readyState.status !== "ready") throw new Error("Expected an available ready fixture");
    const decisionState = {
      ...readyState,
      status: "blocked",
      blockers: [{ code: "MISSING_AWARD_DECISION", subject: "Top Assist", repairTarget: "awards" }],
      awards: awards.map((award) => award.award === "top_assist"
        ? { ...award, selectedPlayerId: null, decisionReason: null }
        : award),
    } satisfies CompletionWorkspaceState;
    const complete = vi.fn(async (input: unknown) => {
      expect(input).toMatchObject({
        decisions: expect.arrayContaining([
          { award: "top_assist", playerId: "p5", reason: "Won the event tie-break review" },
        ]),
      });
      return { status: "integration_required" as const };
    });
    await act(async () => root.render(provider("en", <CompletionWorkspace
      completeAction={complete}
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={decisionState}
    />)));
    const completeButton = container.querySelector<HTMLButtonElement>("[data-complete-tournament]")!;

    expect(completeButton.disabled).toBe(true);
    const blocker = container.querySelector('[data-blocker="MISSING_AWARD_DECISION"]')!;
    expect(blocker.textContent).toContain("Choose a winner for Top Assist.");
    const repair = blocker.querySelector<HTMLButtonElement>('[data-repair-target="awards"]')!;
    expect(repair.textContent).toContain("Review awards");

    await act(async () => repair.click());
    expect(container.querySelector('[role="tabpanel"]:not([hidden])')?.id).toBe("completion-panel-awards");
    const candidate = container.querySelector<HTMLInputElement>('input[name="award-top_assist"][value="p5"]')!;
    expect(candidate).not.toBeNull();
    await act(async () => candidate.click());
    expect(completeButton.disabled).toBe(true);

    const reason = container.querySelector<HTMLTextAreaElement>('textarea[name="awardReason-top_assist"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(reason, "   ");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(completeButton.disabled).toBe(true);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(reason, "Won the event tie-break review");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(completeButton.disabled).toBe(false);

    await act(async () => completeButton.click());
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("submits the current version and server key, then focuses the inline completion result", async () => {
    const complete = vi.fn(async (input: unknown) => {
      expect(input).toEqual({
        eventId: "event-1",
        expectedVersion: 4,
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        decisions: [
          { award: "mvp", playerId: "p1" },
          { award: "top_scorer", playerId: "p2" },
          { award: "top_defender", playerId: "p3" },
          { award: "top_assist", playerId: "p4", reason: "Higher contribution in wins" },
        ],
      });
      return { status: "completed" as const, eventId: "event-1", version: 5, snapshot: {} as never };
    });
    await act(async () => root.render(provider("en", <CompletionWorkspace
      completeAction={complete}
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={state("ready")}
    />)));

    await act(async () => container.querySelector<HTMLButtonElement>("[data-complete-tournament]")!.click());

    const result = container.querySelector<HTMLElement>('[data-action-result][role="status"]')!;
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.textContent).toContain("Tournament completed successfully");
    expect(document.activeElement).toBe(result);
  });

  it("refreshes authoritative readiness blockers returned by the completion action", async () => {
    const complete = vi.fn(async () => ({
      status: "blocked" as const,
      code: "not_ready" as const,
      blockers: [{ code: "ACTIVE_DISPUTE" as const, disputeId: "D-9", matchId: "final-2" }],
    }));
    await act(async () => root.render(provider("en", <CompletionWorkspace
      completeAction={complete}
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={state("ready")}
    />)));

    const completeButton = container.querySelector<HTMLButtonElement>("[data-complete-tournament]")!;
    await act(async () => completeButton.click());

    expect(container.querySelector("[data-action-result]")?.textContent).toContain("Completion sources changed. Review the refreshed blockers.");
    expect(container.querySelector('[role="tabpanel"]:not([hidden])')?.id).toBe("completion-panel-readiness");
    const blocker = container.querySelector('[data-blocker="ACTIVE_DISPUTE"]')!;
    expect(blocker.textContent).toContain("Dispute D-9 · Match final-2");
    expect(blocker.querySelector('a[href="/en/organizer/events/event-1/matches?dispute=D-9"]')).not.toBeNull();
    expect(completeButton.disabled).toBe(true);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    await act(async () => completeButton.click());
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["invalid_decisions", "One or more award winners are no longer valid. Review the published candidates."],
    ["tie_reason_required", "A tied award still needs a nonblank audit reason."],
    ["source_incomplete", "The podium source is incomplete. Repair team or result data in Match Day."],
    ["feature_disabled", "Completion is not enabled for this workspace."],
    ["unauthorized", "Your session expired. Sign in again before retrying."],
    ["password_change_required", "Change your password before managing tournament completion."],
    ["forbidden", "You do not have permission to manage this event."],
    ["invalid_input", "The completion request is invalid. Review the award decisions and retry."],
    ["competitive_locked", "This tournament is already competitively locked. Refresh the workspace."],
  ] as const)("renders actionable feedback for the %s result code", async (code, expected) => {
    const complete = vi.fn(async () => ({ status: "blocked" as const, code }));
    await act(async () => root.render(provider("en", <CompletionWorkspace
      completeAction={complete}
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={state("ready")}
    />)));

    await act(async () => container.querySelector<HTMLButtonElement>("[data-complete-tournament]")!.click());
    expect(container.querySelector("[data-action-result]")?.textContent).toContain(expected);
  });

  it("blocks an immediately rejected award resubmission until fresh authoritative props reconcile", async () => {
    const initialState = state("ready");
    const complete = vi.fn()
      .mockResolvedValueOnce({ status: "blocked" as const, code: "invalid_decisions" as const })
      .mockResolvedValueOnce({ status: "completed" as const, eventId: "event-1", version: 6, snapshot: {} as never });
    const workspace = (workspaceState: CompletionWorkspaceState) => provider("en", <CompletionWorkspace
      completeAction={complete}
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={workspaceState}
    />);
    await act(async () => root.render(workspace(initialState)));

    const completeButton = container.querySelector<HTMLButtonElement>("[data-complete-tournament]")!;
    await act(async () => completeButton.click());

    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    expect(completeButton.disabled).toBe(true);
    expect(container.querySelector("[data-award-action-blocker]")?.textContent).toContain("no longer valid");
    expect(container.querySelector("[data-award-action-blocker]")?.getAttribute("role")).toBeNull();
    expect(container.querySelectorAll('[aria-live], [role="alert"]')).toHaveLength(1);
    await act(async () => completeButton.click());
    expect(complete).toHaveBeenCalledTimes(1);

    if (initialState.status !== "ready") throw new Error("Expected a ready fixture");
    const refreshedState = {
      ...initialState,
      version: 5,
      awards: initialState.awards.map((award) => award.award === "top_assist"
        ? {
            ...award,
            candidates: [award.candidates[1]],
            selectedPlayerId: "p5",
            decisionReason: "Authoritative tie review",
          }
        : award),
    } satisfies CompletionWorkspaceState;
    await act(async () => root.render(workspace(refreshedState)));

    expect(container.querySelector("[data-award-action-blocker]")).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[name="award-top_assist"][value="p5"]')?.checked).toBe(true);
    expect(container.querySelector<HTMLTextAreaElement>('textarea[name="awardReason-top_assist"]')?.value).toBe("Authoritative tie review");
    expect(container.querySelector<HTMLButtonElement>("[data-complete-tournament]")?.disabled).toBe(false);
  });

  it.each([
    [
      "conflict",
      { status: "conflict" as const, version: 5, code: "stale_version" as const },
      "The version changed in another session. Refresh before trying again.",
    ],
    [
      "source_incomplete",
      { status: "blocked" as const, code: "source_incomplete" as const },
      "The podium source is incomplete. Repair team or result data in Match Day.",
    ],
    [
      "competitive_locked",
      { status: "blocked" as const, code: "competitive_locked" as const },
      "This tournament is already competitively locked. Refresh the workspace.",
    ],
    [
      "integration_required",
      { status: "integration_required" as const },
      "Match Day integration is required before this action can run.",
    ],
  ] as const)("locks completion after the %s stale outcome until authoritative state changes", async (_label, result, expected) => {
    const initialState = state("ready");
    const complete = vi.fn(async () => result);
    const workspace = (workspaceState: CompletionWorkspaceState) => provider("en", <CompletionWorkspace
      completeAction={complete}
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={workspaceState}
    />);
    await act(async () => root.render(workspace(initialState)));
    const button = container.querySelector<HTMLButtonElement>("[data-complete-tournament]")!;

    await act(async () => button.click());
    expect(container.querySelector("[data-action-result]")?.textContent).toContain(expected);
    expect(container.querySelector("[data-refresh-action-blocker]")?.textContent).toContain(expected);
    expect(container.querySelector("[data-refresh-action-blocker]")?.getAttribute("role")).toBeNull();
    expect(container.querySelector('[role="tabpanel"]:not([hidden])')?.textContent).not.toContain("All required gates are clear");
    expect(button.disabled).toBe(true);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    await act(async () => button.click());
    expect(complete).toHaveBeenCalledTimes(1);

    if (initialState.status !== "ready") throw new Error("Expected a ready fixture");
    await act(async () => root.render(workspace({ ...initialState, version: 5 })));
    expect(container.querySelector<HTMLButtonElement>("[data-complete-tournament]")?.disabled).toBe(false);
  });

  it.each([
    ["conflict", { status: "conflict" as const, version: 6, code: "stale_version" as const }, "The version changed in another session."],
    ["not_completed", { status: "blocked" as const, code: "not_completed" as const }, "Only a completed tournament can be reopened."],
  ] as const)("locks reopen after the %s stale outcome until authoritative state changes", async (_label, result, expected) => {
    const initialState = state("completed");
    const reopen = vi.fn(async () => result);
    const workspace = (workspaceState: CompletionWorkspaceState) => provider("en", <CompletionWorkspace
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenAction={reopen}
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={workspaceState}
    />);
    await act(async () => root.render(workspace(initialState)));
    const reason = container.querySelector<HTMLTextAreaElement>('textarea[name="reopenReason"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(reason, "Refresh stale completion state");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const button = container.querySelector<HTMLButtonElement>("[data-reopen-tournament]")!;

    await act(async () => button.click());
    expect(container.querySelector("[data-action-result]")?.textContent).toContain(expected);
    expect(button.disabled).toBe(true);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    await act(async () => button.click());
    expect(reopen).toHaveBeenCalledTimes(1);

    if (initialState.status !== "completed") throw new Error("Expected a completed fixture");
    await act(async () => root.render(workspace({ ...initialState, version: 6 })));
    expect(container.querySelector<HTMLButtonElement>("[data-reopen-tournament]")?.disabled).toBe(false);
  });

  it("preserves active valid award edits across an equivalent RSC rerender", async () => {
    const readyState = state("ready");
    await act(async () => root.render(provider("en", <CompletionWorkspace
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={readyState}
    />)));
    await act(async () => container.querySelector<HTMLButtonElement>("#completion-tab-awards")!.click());
    const candidate = container.querySelector<HTMLInputElement>('input[name="award-top_assist"][value="p5"]')!;
    const reason = container.querySelector<HTMLTextAreaElement>('textarea[name="awardReason-top_assist"]')!;
    await act(async () => candidate.click());
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(reason, "Active organizer edit");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const equivalentState = structuredClone(readyState);
    await act(async () => root.render(provider("en", <CompletionWorkspace
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={equivalentState}
    />)));

    expect(container.querySelector<HTMLInputElement>('input[name="award-top_assist"][value="p5"]')?.checked).toBe(true);
    expect(container.querySelector<HTMLTextAreaElement>('textarea[name="awardReason-top_assist"]')?.value).toBe("Active organizer edit");
  });

  it("renders completed awards as read-only until authoritative reopened props arrive", async () => {
    const workspace = (workspaceState: CompletionWorkspaceState) => provider("en", <CompletionWorkspace
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={workspaceState}
    />);
    await act(async () => root.render(workspace(state("completed"))));
    await act(async () => container.querySelector<HTMLButtonElement>("#completion-tab-awards")!.click());

    expect(Array.from(container.querySelectorAll<HTMLInputElement>('input[name^="award-"]')).every((input) => input.disabled)).toBe(true);
    const completedReason = container.querySelector<HTMLTextAreaElement>('textarea[name="awardReason-top_assist"]')!;
    expect(completedReason.readOnly).toBe(true);
    expect(completedReason.getAttribute("aria-readonly")).toBe("true");

    await act(async () => root.render(workspace(state("reopened"))));
    expect(Array.from(container.querySelectorAll<HTMLInputElement>('input[name^="award-"]')).every((input) => !input.disabled)).toBe(true);
    expect(container.querySelector<HTMLTextAreaElement>('textarea[name="awardReason-top_assist"]')?.readOnly).toBe(false);
  });

  it("shows pending feedback and prevents duplicate completion submissions", async () => {
    let resolve!: (value: { status: "integration_required" }) => void;
    const complete = vi.fn(() => new Promise<{ status: "integration_required" }>((done) => { resolve = done; }));
    await act(async () => root.render(provider("en", <CompletionWorkspace
      completeAction={complete}
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={state("ready")}
    />)));
    const button = container.querySelector<HTMLButtonElement>("[data-complete-tournament]")!;

    act(() => button.click());
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Completing…");
    act(() => button.click());
    expect(complete).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ status: "integration_required" }));
    expect(container.querySelector('[data-action-result]')?.textContent).toContain("Match Day integration is required");
  });

  it("requires a reopen reason and reports the completed reopen action inline", async () => {
    const reopen = vi.fn(async (input: unknown) => {
      expect(input).toEqual({
        eventId: "event-1",
        expectedVersion: 5,
        idempotencyKey: "22222222-2222-4222-8222-222222222222",
        reason: "Correct the final score",
      });
      return { status: "reopened" as const, eventId: "event-1", version: 6 };
    });
    await act(async () => root.render(provider("en", <CompletionWorkspace
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenAction={reopen}
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={state("completed")}
    />)));

    const reason = container.querySelector<HTMLTextAreaElement>('textarea[name="reopenReason"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(reason, "Correct the final score");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector<HTMLButtonElement>("[data-reopen-tournament]")!.click());

    expect(reopen).toHaveBeenCalledTimes(1);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-action-result]')?.textContent).toContain("Tournament reopened for a recorded correction");
  });

  it("uses the complete English and Indonesian workspace messages", () => {
    expect(staticWorkspace("integration_required", "en")).toContain("Connect Match Day before reviewing completion data.");
    expect(staticWorkspace("integration_required", "id")).toContain("Hubungkan Match Day sebelum meninjau data penyelesaian.");
    expect(staticWorkspace("integration_required", "id")).toContain("Kesiapan");
    expect(staticWorkspace("integration_required", "id")).toContain("Publikasi");
  });

  it("renders integration-owned fields as unavailable without zero counts, draft claims, or preview links", () => {
    const integrationState = {
      status: "integration_required",
      event: { id: "event-1", name: "Miracle Open", formatLabel: "Group + Playoffs", matchDayHref: "/en/organizer/events/event-1/matches" },
      version: null,
      blockers: null,
      podium: { sourceKind: "integration_pending", sourceLabel: null, locked: null, placements: null },
      awards: awards.map(({ award }) => ({ award, metricLabel: null, candidates: null, selectedPlayerId: null, decisionReason: null, tied: null })),
      certificates: { generated: null, total: null, status: "integration_pending", studioHref: null },
      publication: { status: "integration_pending", previewHref: null },
      audit: { lastAction: null, actorLabel: null, at: null, summary: null },
    } satisfies CompletionWorkspaceState;
    const markup = renderToStaticMarkup(provider("en", <CompletionWorkspace
      completionIdempotencyKey="11111111-1111-4111-8111-111111111111"
      reopenIdempotencyKey="22222222-2222-4222-8222-222222222222"
      state={integrationState}
    />));

    expect(markup).toContain("Waiting for Match Day integration");
    expect(markup).not.toContain("0 / 7");
    const host = document.createElement("div");
    host.innerHTML = markup;
    const versionKpi = Array.from(host.querySelectorAll("[data-completion-kpis] article"))
      .find((item) => item.textContent?.includes("Current version"));
    expect(versionKpi?.textContent).toContain("Waiting for Match Day integration");
    expect(versionKpi?.textContent).not.toContain("Current version0");
    expect(markup).not.toContain("Draft — not ready to publish");
    expect(markup).not.toContain("No completion action has been committed");
    expect(markup).not.toContain('href="/en/events/miracle-open"');
    expect(markup).not.toContain("Open certificate studio");
  });

  it("contains wide layouts at 1100px and stacks KPI, podium, award, and actions below 700px", () => {
    const host = document.createElement("div");
    host.innerHTML = staticWorkspace("ready");
    expect(host.querySelector("[data-completion-workspace]")?.className).toContain("overflow-x-clip");
    expect(host.querySelector("[data-completion-layout]")?.className).toContain("min-[1100px]:grid-cols");
    expect(host.querySelector("[data-completion-kpis]")?.className).toContain("min-[700px]:grid-cols-4");
    expect(host.querySelector("[data-podium-grid]")?.className).toContain("min-[700px]:grid-cols-3");
    expect(host.querySelector("[data-award-grid]")?.className).toContain("min-[700px]:grid-cols-2");
    expect(host.querySelector("[data-completion-actions]")?.className).toContain("min-[700px]:grid-cols-2");
  });

  it("uses semantic AA foregrounds and strong control boundaries instead of raw accent text", () => {
    const host = document.createElement("div");
    host.innerHTML = staticWorkspace("ready");
    const complete = host.querySelector<HTMLButtonElement>("[data-complete-tournament]")!;
    const classNames = Array.from(host.querySelectorAll<HTMLElement>("[class]"), (element) => element.className).join(" ");

    expect(complete.className).toContain("text-[var(--color-on-accent)]");
    expect(complete.className).not.toContain("text-white");
    expect(classNames).not.toContain("disabled:opacity-");
    expect(classNames).toContain("text-[var(--color-text-muted)]");
    expect(classNames).not.toContain("text-[var(--color-text-subtle)]");
    expect(classNames).not.toContain("text-[var(--color-brand-cyan)]");
    expect(classNames).not.toContain("text-[var(--color-brand-violet)]");
    expect(classNames).not.toContain("text-[var(--color-brand-cream)]");
    expect(host.querySelector<HTMLTextAreaElement>('textarea[name="reopenReason"]')?.className).toContain("border-[var(--color-border-strong)]");
    expect(classNames).toContain("aria-[selected=true]:bg-[var(--color-surface-selected)]");
    expect(classNames).not.toContain("color-surface-strong");
  });
});
