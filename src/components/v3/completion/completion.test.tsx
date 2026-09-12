// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../messages/en.json";
import idMessages from "../../../../messages/id.json";
import { CompletionWorkspace, type CompletionWorkspaceState } from "./CompletionWorkspace";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const awards: CompletionWorkspaceState["awards"] = [
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
  event: { id: "event-1", name: "Miracle Open", formatLabel: "Group + Playoffs" },
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
    return { ...baseState, status, blockers: [], podium: { ...baseState.podium, sourceKind: "integration_pending", placements: [] }, awards: awards.map((award) => ({ ...award, candidates: [], selectedPlayerId: null, tied: false })) };
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
    expect(container.querySelector('[data-action-result]')?.textContent).toContain("Tournament reopened for a recorded correction");
  });

  it("uses the complete English and Indonesian workspace messages", () => {
    expect(staticWorkspace("integration_required", "en")).toContain("Connect Match Day before reviewing completion data.");
    expect(staticWorkspace("integration_required", "id")).toContain("Hubungkan Match Day sebelum meninjau data penyelesaian.");
    expect(staticWorkspace("integration_required", "id")).toContain("Kesiapan");
    expect(staticWorkspace("integration_required", "id")).toContain("Publikasi");
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
});
