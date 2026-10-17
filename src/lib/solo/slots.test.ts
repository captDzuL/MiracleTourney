import { describe, expect, it } from "vitest";

import { FLASHPEAK_RULES, KUROKO_RULES } from "./fixtures";
import { assertSupportedRules, computeQuota, decideRegistration, pickNextQueued, slotGroupOf } from "./slots";

describe("assertSupportedRules", () => {
  it("returns the single required position", () => {
    expect(assertSupportedRules(FLASHPEAK_RULES)).toEqual({ requiredPosition: "Goalkeeper" });
    expect(assertSupportedRules(KUROKO_RULES)).toEqual({ requiredPosition: "Center" });
  });

  it("rejects rules phase 1 cannot draw", () => {
    expect(() => assertSupportedRules({ teamSize: 5, requiredPositions: {} })).toThrow(RangeError);
    expect(() => assertSupportedRules({ teamSize: 5, requiredPositions: { Goalkeeper: 2 } })).toThrow(RangeError);
    expect(() => assertSupportedRules({ teamSize: 5, requiredPositions: { Goalkeeper: 0 } })).toThrow(RangeError);
    expect(() => assertSupportedRules({ teamSize: 5, requiredPositions: { Goalkeeper: 1, Defender: 1 } })).toThrow(RangeError);
    expect(() => assertSupportedRules({ teamSize: 1, requiredPositions: { Goalkeeper: 1 } })).toThrow(RangeError);
    expect(() => assertSupportedRules({ teamSize: 4.5, requiredPositions: { Goalkeeper: 1 } })).toThrow(RangeError);
  });
});

describe("slotGroupOf", () => {
  it("puts the required position in its own group", () => {
    expect(slotGroupOf("Goalkeeper", FLASHPEAK_RULES)).toBe("required");
    expect(slotGroupOf("  goalkeeper ", FLASHPEAK_RULES)).toBe("required");
  });

  it("puts every other position in the open group", () => {
    expect(slotGroupOf("Forward", FLASHPEAK_RULES)).toBe("open");
    expect(slotGroupOf("Center", FLASHPEAK_RULES)).toBe("open");
  });

  it("follows the rules it is given instead of a fixed position", () => {
    expect(slotGroupOf("Center", KUROKO_RULES)).toBe("required");
    expect(slotGroupOf("Goalkeeper", KUROKO_RULES)).toBe("open");
  });
});

describe("computeQuota", () => {
  it("gives one required slot per team and the rest open", () => {
    expect(computeQuota(8, FLASHPEAK_RULES)).toEqual({ required: 8, open: 32 });
    expect(computeQuota(12, FLASHPEAK_RULES)).toEqual({ required: 12, open: 48 });
    expect(computeQuota(8, KUROKO_RULES)).toEqual({ required: 8, open: 16 });
  });

  it("rejects an invalid team count", () => {
    expect(() => computeQuota(0, FLASHPEAK_RULES)).toThrow(RangeError);
    expect(() => computeQuota(2.5, FLASHPEAK_RULES)).toThrow(RangeError);
  });
});

describe("decideRegistration", () => {
  it("approves a free registration while a slot is left", () => {
    expect(decideRegistration({ used: 31, quota: 32, free: true })).toBe("approved");
  });

  it("asks a paid registration to pay while a slot is left", () => {
    expect(decideRegistration({ used: 0, quota: 32, free: false })).toBe("pending_payment");
  });

  it("queues when the group is full, free or paid", () => {
    expect(decideRegistration({ used: 32, quota: 32, free: false })).toBe("queued");
    expect(decideRegistration({ used: 32, quota: 32, free: true })).toBe("queued");
    expect(decideRegistration({ used: 40, quota: 32, free: true })).toBe("queued");
  });
});

describe("pickNextQueued", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 12, 0, minute));

  it("returns null for an empty queue", () => {
    expect(pickNextQueued([])).toBeNull();
  });

  it("picks the earliest registration", () => {
    const queue = [
      { id: "b", createdAt: at(5) },
      { id: "a", createdAt: at(9) },
      { id: "c", createdAt: at(2) },
    ];
    expect(pickNextQueued(queue)?.id).toBe("c");
  });

  it("breaks a time tie with the smaller id and does not depend on input order", () => {
    const first = { id: "a", createdAt: at(3) };
    const second = { id: "b", createdAt: at(3) };
    expect(pickNextQueued([second, first])?.id).toBe("a");
    expect(pickNextQueued([first, second])?.id).toBe("a");
  });

  it("does not change the queue it is given", () => {
    const queue = [{ id: "b", createdAt: at(5) }, { id: "a", createdAt: at(1) }];
    pickNextQueued(queue);
    expect(queue.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});
