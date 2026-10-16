import { describe, expect, it } from "vitest";

import {
  COMPLETION_GRACE_MS,
  extendedDeadline,
  getCompletionGaps,
  getCompletionState,
  newCompletionDeadline,
} from "./completion";

const now = new Date("2026-10-16T12:00:00.000Z");

describe("getCompletionGaps", () => {
  it("reports nothing for a team with a contact and a full roster", () => {
    expect(getCompletionGaps({ captainContact: "081234567890", playerCount: 5, requiredPlayers: 5 })).toEqual({
      missingContact: false,
      missingPlayers: 0,
    });
  });

  it.each([null, undefined, "", "   "])("treats %j as a missing contact", (captainContact) => {
    expect(getCompletionGaps({ captainContact, playerCount: 5, requiredPlayers: 5 }).missingContact).toBe(true);
  });

  it("counts how many players the roster still needs", () => {
    expect(getCompletionGaps({ captainContact: "081234567890", playerCount: 3, requiredPlayers: 5 }).missingPlayers).toBe(2);
  });

  it("never reports a negative number when the roster has substitutes", () => {
    expect(getCompletionGaps({ captainContact: "081234567890", playerCount: 8, requiredPlayers: 5 }).missingPlayers).toBe(0);
  });
});

describe("deadlines", () => {
  it("gives two days from now", () => {
    expect(newCompletionDeadline(now).getTime() - now.getTime()).toBe(COMPLETION_GRACE_MS);
    expect(COMPLETION_GRACE_MS).toBe(48 * 60 * 60 * 1000);
  });

  it("extends from the old deadline while it is still ahead", () => {
    const deadline = new Date(now.getTime() + 3_600_000);
    expect(extendedDeadline(deadline, now).getTime()).toBe(deadline.getTime() + COMPLETION_GRACE_MS);
  });

  it("extends from now once the deadline has passed or is missing", () => {
    expect(extendedDeadline(new Date(now.getTime() - 3_600_000), now).getTime()).toBe(now.getTime() + COMPLETION_GRACE_MS);
    expect(extendedDeadline(null, now).getTime()).toBe(now.getTime() + COMPLETION_GRACE_MS);
  });
});

describe("getCompletionState", () => {
  const gaps = { missingContact: true, missingPlayers: 0 };
  const none = { missingContact: false, missingPlayers: 0 };

  it("is complete when nothing is missing, even with an old deadline", () => {
    expect(getCompletionState(none, new Date(now.getTime() - 1), now)).toBe("complete");
  });

  it("is incomplete before a deadline exists", () => {
    expect(getCompletionState(gaps, null, now)).toBe("incomplete");
  });

  it("is pending while the deadline is ahead", () => {
    expect(getCompletionState(gaps, new Date(now.getTime() + 1), now)).toBe("pending");
  });

  it("is overdue from the deadline on", () => {
    expect(getCompletionState(gaps, new Date(now.getTime()), now)).toBe("overdue");
    expect(getCompletionState(gaps, new Date(now.getTime() - 1), now)).toBe("overdue");
  });
});
