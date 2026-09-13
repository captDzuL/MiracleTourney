import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/platform/types";
import type { CompletionSnapshot } from "@/lib/completion/complete";

const external = vi.hoisted(() => ({ requireAnyRole: vi.fn(), assertUserCanManageEvent: vi.fn(), revalidatePath: vi.fn(), dependencies: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: external.requireAnyRole }));
vi.mock("@/lib/platform/repository", () => ({ assertUserCanManageEvent: external.assertUserCanManageEvent }));
vi.mock("next/cache", () => ({ revalidatePath: external.revalidatePath }));
vi.mock("@/lib/completion/prisma-adapter", () => ({ createPrismaCompletionDependencies: external.dependencies }));
vi.mock("@/lib/completion/complete", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/completion/complete")>();
  return { ...actual, completeTournament: vi.fn(actual.completeTournament), reopenTournament: vi.fn(actual.reopenTournament) };
});

import { completeTournament, reopenTournament } from "@/lib/completion/complete";
import { completeTournamentAction, reopenTournamentAction } from "./completion-v3-actions";

const organizer: AppUser = { id: "organizer-1", role: "organizer", name: "Organizer", email: "organizer@example.com", mustChangePassword: false };
const base = { eventId: "event-1", expectedVersion: 0, idempotencyKey: "11111111-1111-4111-8111-111111111111" };
const awards = ["mvp", "top_scorer", "top_defender", "top_assist"] as const;
const decisions = awards.map((award) => ({ award, playerId: "player-a" }));
const cases = [
  { name: "complete", action: completeTournamentAction, input: { ...base, decisions } },
  { name: "reopen", action: reopenTournamentAction, input: { ...base, reason: "Correct score" } },
];

describe("completion V3 server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FEATURE_FLAG_COMPLETION_WORKSPACE_V3", "true");
    external.requireAnyRole.mockResolvedValue(organizer);
    external.dependencies.mockReturnValue({ transaction: vi.fn() });
    vi.mocked(completeTournament).mockResolvedValue({ status: "integration_required" });
    vi.mocked(reopenTournament).mockResolvedValue({ status: "integration_required" });
    // Models the existing repository's ownership result, without a database connection.
    external.assertUserCanManageEvent.mockImplementation(async (user: AppUser, eventId: string) => {
      if (user.role === "organizer" && (user.id !== "organizer-1" || eventId !== "event-1")) throw new Error("Not authorized");
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  describe.each(cases)("$name", ({ action, input }) => {
    // These gates fail if the action forwards an unauthorized/invalid mutation.
    it("blocks the disabled completion flag without invoking the mutation", async () => {
      vi.stubEnv("FEATURE_FLAG_COMPLETION_WORKSPACE_V3", "false");
      expect(await action(input)).toEqual({ status: "blocked", code: "feature_disabled" });
      expect(completeTournament).not.toHaveBeenCalled();
      expect(reopenTournament).not.toHaveBeenCalled();
      expect(external.revalidatePath).not.toHaveBeenCalled();
    });
    it("rejects a missing session", async () => {
      external.requireAnyRole.mockResolvedValue(null);
      expect(await action(input)).toEqual({ status: "blocked", code: "unauthorized" });
      expect(completeTournament).not.toHaveBeenCalled();
      expect(reopenTournament).not.toHaveBeenCalled();
    });
    it("rejects forced-password organizers", async () => {
      external.requireAnyRole.mockResolvedValue({ ...organizer, mustChangePassword: true });
      expect(await action(input)).toEqual({ status: "blocked", code: "password_change_required" });
      expect(completeTournament).not.toHaveBeenCalled();
      expect(reopenTournament).not.toHaveBeenCalled();
    });
    it("rejects another organizer's event using the repository ownership guard", async () => {
      external.requireAnyRole.mockResolvedValue({ ...organizer, id: "other-organizer" });
      expect(await action(input)).toEqual({ status: "blocked", code: "forbidden" });
      expect(completeTournament).not.toHaveBeenCalled();
      expect(reopenTournament).not.toHaveBeenCalled();
      expect(external.revalidatePath).not.toHaveBeenCalled();
    });
    it.each(["organizer", "platform_admin", "admin"] as const)("allows %s through to the explicit integration-required result", async (role) => {
      const user = { ...organizer, role };
      external.requireAnyRole.mockResolvedValue(user);
      expect(await action(input)).toEqual({ status: "integration_required" });
      expect(external.requireAnyRole).toHaveBeenCalledWith(["organizer", "platform_admin", "admin"]);
      expect(external.assertUserCanManageEvent).toHaveBeenCalledWith(user, "event-1");
      expect(external.dependencies).toHaveBeenCalledWith({ id: user.id, role });
      expect(external.revalidatePath).not.toHaveBeenCalled();
    });
    it.each([
      { name: "blank event", patch: { eventId: "  " } },
      { name: "negative version", patch: { expectedVersion: -1 } },
      { name: "fractional version", patch: { expectedVersion: 1.5 } },
      { name: "invalid UUID", patch: { idempotencyKey: "invalid" } },
      { name: "client facts", patch: { facts: { ready: true } } },
      { name: "client dependencies", patch: { dependencies: {} } },
      { name: "client actor", patch: { actor: { id: "admin" } } },
    ])("rejects $name without exposing an injectable action input", async ({ patch }) => {
      expect(await action({ ...input, ...patch })).toEqual({ status: "blocked", code: "invalid_input" });
      expect(completeTournament).not.toHaveBeenCalled();
      expect(reopenTournament).not.toHaveBeenCalled();
      expect(external.revalidatePath).not.toHaveBeenCalled();
    });
  });

  it.each([
    [], decisions.slice(1), [...decisions, decisions[0]],
    [decisions[0], decisions[0], decisions[2], decisions[3]],
    decisions.map((row) => ({ ...row, playerId: " " })),
    decisions.map((row) => ({ ...row, value: 999 })),
  ].map((rows) => ({ rows })))("validates the complete set of client award decisions (%#)", async ({ rows }) => {
    expect(await completeTournamentAction({ ...base, decisions: rows })).toEqual({ status: "blocked", code: "invalid_input" });
    expect(completeTournament).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "x".repeat(2001), null])("validates reopen's non-blank audit reason (%#)", async (reason) => {
    expect(await reopenTournamentAction({ ...base, reason })).toEqual({ status: "blocked", code: "invalid_input" });
    expect(reopenTournament).not.toHaveBeenCalled();
  });

  it("revalidates the organizer completion path only after an actual completion commit", async () => {
    const recipient = { playerId: "player-a", playerName: "Ari", teamId: "team-a", teamName: "Alpha", value: 5 };
    const snapshot: CompletionSnapshot = {
      eventId: "event-1", version: 1, actor: { id: "organizer-1", role: "organizer" },
      podium: [{ rank: 1, teamId: "team-a", teamName: "Alpha" }, { rank: 2, teamId: "team-b", teamName: "Beta" }, { rank: 3, teamId: "team-c", teamName: "Gamma" }],
      awards: awards.map((award) => ({ award, recipient, candidates: [recipient], reason: null })),
      source: { facts: { formatKind: "round_robin", matches: [], standings: [{ rank: 1, teamId: "team-a", locked: true, unresolvedTie: false }, { rank: 2, teamId: "team-b", locked: true, unresolvedTie: false }, { rank: 3, teamId: "team-c", locked: true, unresolvedTie: false }], activeDisputes: [], validatedAwardStatistics: [...awards] }, statistics: awards.map((award) => ({ ...recipient, award, status: "published", validated: true })), teams: [{ id: "team-a", name: "Alpha" }, { id: "team-b", name: "Beta" }, { id: "team-c", name: "Gamma" }] },
    };
    const result = { status: "completed" as const, eventId: "event-1", version: 1, snapshot };
    vi.mocked(completeTournament).mockResolvedValueOnce(result);
    expect(await completeTournamentAction({ ...base, decisions })).toEqual(result);
    expect(completeTournament).toHaveBeenCalledWith("event-1", decisions, 0, base.idempotencyKey, expect.any(Object));
    expect(external.revalidatePath.mock.calls).toEqual([["/organizer/events/event-1/completion"]]);
    external.revalidatePath.mockClear();
    vi.mocked(completeTournament).mockResolvedValueOnce({ status: "already_applied", eventId: "event-1", version: 1, result });
    expect(await completeTournamentAction({ ...base, decisions })).toMatchObject({ status: "already_applied" });
    expect(external.revalidatePath).not.toHaveBeenCalled();
  });

  it("normalizes the reopen reason and revalidates only a newly committed reopen", async () => {
    vi.mocked(reopenTournament).mockResolvedValueOnce({ status: "reopened", eventId: "event-1", version: 2 });
    expect(await reopenTournamentAction({ ...base, expectedVersion: 1, reason: "  Correct score  " })).toEqual({ status: "reopened", eventId: "event-1", version: 2 });
    expect(reopenTournament).toHaveBeenCalledWith("event-1", "Correct score", 1, base.idempotencyKey, expect.any(Object));
    expect(external.revalidatePath.mock.calls).toEqual([["/organizer/events/event-1/completion"]]);
    external.revalidatePath.mockClear();
    vi.mocked(reopenTournament).mockResolvedValueOnce({ status: "conflict", code: "stale_version", version: 2 });
    expect(await reopenTournamentAction({ ...base, reason: "Correct score" })).toMatchObject({ status: "conflict" });
    expect(external.revalidatePath).not.toHaveBeenCalled();
  });
});
