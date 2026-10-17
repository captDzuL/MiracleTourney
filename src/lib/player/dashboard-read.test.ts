import { describe, expect, it } from "vitest";

import { playerStage } from "./dashboard-read";

const NOW = new Date("2026-10-14T10:00:00.000Z");
const FUTURE = new Date("2026-10-15T10:00:00.000Z");
const PAST = new Date("2026-10-13T10:00:00.000Z");

type Input = Parameters<typeof playerStage>[0];

const registration = (overrides: Partial<Input["registration"]> = {}): Input["registration"] => ({
  status: "approved" as const,
  expiresAt: null,
  rejectReason: null,
  approvedAt: PAST,
  refundedAt: null,
  ...overrides,
});

const stage = (overrides: Partial<Omit<Input, "registration">> & { registration?: Partial<Input["registration"]> } = {}) =>
  playerStage({
    registration: registration(overrides.registration),
    queuePosition: overrides.queuePosition ?? null,
    now: NOW,
    event: overrides.event ?? { feeRequired: true, teamsLocked: false },
    placement: overrides.placement ?? null,
  });

describe("playerStage", () => {
  it("tells a queued player their place in the line", () => {
    expect(stage({ registration: { status: "queued" }, queuePosition: 3 })).toEqual({ kind: "queued", position: 3 });
    expect(stage({ registration: { status: "queued" } })).toEqual({ kind: "queued", position: null });
  });

  it("asks for payment only while the deadline has not passed", () => {
    expect(stage({ registration: { status: "pending_payment", expiresAt: FUTURE } })).toEqual({ kind: "pay", deadline: FUTURE });
    expect(stage({ registration: { status: "pending_payment", expiresAt: PAST } })).toEqual({ kind: "lost", why: "expired", refund: "none" });
    expect(stage({ registration: { status: "pending_payment", expiresAt: NOW } })).toMatchObject({ kind: "lost" });
  });

  it("keeps a rejected payment open for a new proof until its fresh deadline", () => {
    expect(stage({ registration: { status: "rejected", expiresAt: FUTURE, rejectReason: "Bukti buram" } })).toEqual({ kind: "rejected", reason: "Bukti buram", deadline: FUTURE });
    expect(stage({ registration: { status: "rejected", expiresAt: PAST } })).toMatchObject({ kind: "lost", why: "expired" });
  });

  it("waits for the organizer while a proof is under review", () => {
    expect(stage({ registration: { status: "pending_review" } })).toEqual({ kind: "review" });
  });

  it("calls an approved player waiting until the teams are locked", () => {
    expect(stage()).toEqual({ kind: "waiting" });
    expect(stage({ event: { feeRequired: true, teamsLocked: true }, placement: null })).toEqual({ kind: "waiting" });
  });

  it("keeps an approved player waiting while the event's teams are not locked, whatever a draft says", () => {
    expect(stage({ event: { feeRequired: true, teamsLocked: false }, placement: "starter" })).toEqual({ kind: "waiting" });
    expect(stage({ event: { feeRequired: true, teamsLocked: false }, placement: "unplaced" })).toEqual({ kind: "waiting" });
  });

  it("says in a team, or out of the teams with the state of the refund, once teams are locked", () => {
    const locked = { feeRequired: true, teamsLocked: true };
    expect(stage({ event: locked, placement: "starter" })).toEqual({ kind: "in_team" });
    expect(stage({ event: locked, placement: "unplaced" })).toEqual({ kind: "out_of_teams", refund: "owed" });
    expect(stage({ event: locked, placement: "unplaced", registration: { refundedAt: PAST } })).toEqual({ kind: "out_of_teams", refund: "done" });
    expect(stage({ event: { feeRequired: false, teamsLocked: true }, placement: "unplaced" })).toEqual({ kind: "out_of_teams", refund: "none" });
  });

  it("owes a refund to a player who paid and then withdrew, and to nobody else", () => {
    expect(stage({ registration: { status: "withdrawn" } })).toEqual({ kind: "lost", why: "withdrawn", refund: "owed" });
    expect(stage({ registration: { status: "withdrawn", refundedAt: PAST } })).toEqual({ kind: "lost", why: "withdrawn", refund: "done" });
    expect(stage({ registration: { status: "withdrawn", approvedAt: null } })).toEqual({ kind: "lost", why: "withdrawn", refund: "none" });
    expect(stage({ registration: { status: "withdrawn" }, event: { feeRequired: false, teamsLocked: false } })).toEqual({ kind: "lost", why: "withdrawn", refund: "none" });
  });

  it("calls an expired registration lost", () => {
    expect(stage({ registration: { status: "expired" } })).toEqual({ kind: "lost", why: "expired", refund: "none" });
  });
});
