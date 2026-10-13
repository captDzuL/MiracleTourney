import { describe, expect, it } from "vitest";

import { soloPanelState } from "./registration-state";

const now = new Date("2026-10-13T00:00:00Z");
const later = new Date("2026-10-14T00:00:00Z");
const earlier = new Date("2026-10-12T00:00:00Z");

const reg = (status: string, extra: Record<string, unknown> = {}) =>
  ({ status, rejectReason: null, expiresAt: null, ...extra }) as never;

describe("soloPanelState", () => {
  it("shows the sign-up form to someone with no registration", () => {
    expect(soloPanelState(null, null, now)).toEqual({ kind: "form" });
  });

  it.each(["withdrawn", "expired"])("lets someone whose registration is %s sign up again", (status) => {
    expect(soloPanelState(reg(status), null, now)).toEqual({ kind: "form" });
  });

  it("shows a queued player their place", () => {
    expect(soloPanelState(reg("queued"), 3, now)).toEqual({ kind: "queued", position: 3 });
    expect(soloPanelState(reg("queued"), null, now)).toEqual({ kind: "queued", position: null });
  });

  it("asks a player who holds a slot to pay before the deadline", () => {
    expect(soloPanelState(reg("pending_payment", { expiresAt: later }), null, now)).toEqual({ kind: "pay", deadline: later });
  });

  it("treats an unpaid slot past its deadline as lost, before the sweep has recorded it", () => {
    expect(soloPanelState(reg("pending_payment", { expiresAt: earlier }), null, now)).toEqual({ kind: "form" });
  });

  it("waits for the organizer while the proof is under review", () => {
    expect(soloPanelState(reg("pending_review"), null, now)).toEqual({ kind: "review" });
  });

  it("explains a rejected proof and still allows a new one before the deadline", () => {
    expect(soloPanelState(reg("rejected", { rejectReason: "Nominal kurang", expiresAt: later }), null, now))
      .toEqual({ kind: "rejected", reason: "Nominal kurang", deadline: later });
  });

  it("treats a rejected proof past its deadline as a lost slot", () => {
    expect(soloPanelState(reg("rejected", { rejectReason: "x", expiresAt: earlier }), null, now)).toEqual({ kind: "form" });
  });

  it("confirms an approved player", () => {
    expect(soloPanelState(reg("approved"), null, now)).toEqual({ kind: "approved" });
  });

  it("falls back to the form for a status it does not know", () => {
    expect(soloPanelState(reg("something_new"), null, now)).toEqual({ kind: "form" });
  });
});
