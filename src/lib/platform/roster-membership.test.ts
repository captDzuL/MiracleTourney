import { describe, expect, it } from "vitest";
import { isActivePlayer, matchRosterReferenceTime, parseRosterGaps, rosterForMatch, wasOnRosterAt } from "./roster-membership";

const at = (iso: string) => new Date(iso);
const player = (id: string, createdAt: string, removedAt: string | null = null) => ({
  id, createdAt: at(createdAt), removedAt: removedAt ? at(removedAt) : null,
});

describe("isActivePlayer", () => {
  it("is true only while removedAt is empty", () => {
    expect(isActivePlayer({ removedAt: null })).toBe(true);
    expect(isActivePlayer({ removedAt: at("2026-10-12T00:00:00Z") })).toBe(false);
  });
});

describe("matchRosterReferenceTime", () => {
  it("uses the real start, then the real end, then the confirmation time", () => {
    expect(matchRosterReferenceTime({ actualStartedAt: at("2026-10-12T10:00:00Z"), actualEndedAt: at("2026-10-12T11:00:00Z") }))
      .toEqual(at("2026-10-12T10:00:00Z"));
    expect(matchRosterReferenceTime({ actualEndedAt: at("2026-10-12T11:00:00Z"), resultConfirmedAt: at("2026-10-12T12:00:00Z") }))
      .toEqual(at("2026-10-12T11:00:00Z"));
    expect(matchRosterReferenceTime({ resultConfirmedAt: at("2026-10-12T12:00:00Z") })).toEqual(at("2026-10-12T12:00:00Z"));
  });

  it("is null for a match that has not started, so only active players count", () => {
    expect(matchRosterReferenceTime({})).toBeNull();
    // A planned time is not proof the match happened then.
    expect(matchRosterReferenceTime({ scheduledAt: at("2026-10-20T10:00:00Z") } as never)).toBeNull();
  });
});

describe("wasOnRosterAt", () => {
  const joinedLate = player("p-new", "2026-10-14T00:00:00Z");
  const leftEarly = player("p-old", "2026-10-01T00:00:00Z", "2026-10-14T00:00:00Z");
  const steady = player("p-steady", "2026-10-01T00:00:00Z");

  it("excludes a player who joined after the match started", () => {
    expect(wasOnRosterAt(joinedLate, at("2026-10-12T10:00:00Z"))).toBe(false);
    expect(wasOnRosterAt(joinedLate, at("2026-10-15T10:00:00Z"))).toBe(true);
  });

  it("keeps a player who left only after the match started", () => {
    expect(wasOnRosterAt(leftEarly, at("2026-10-12T10:00:00Z"))).toBe(true);
    expect(wasOnRosterAt(leftEarly, at("2026-10-15T10:00:00Z"))).toBe(false);
  });

  it("without a reference time only active players count", () => {
    expect(wasOnRosterAt(steady, null)).toBe(true);
    expect(wasOnRosterAt(leftEarly, null)).toBe(false);
    expect(wasOnRosterAt(joinedLate, null)).toBe(true);
  });
});

describe("rosterForMatch", () => {
  const steady = player("p-steady", "2026-10-01T00:00:00Z");
  const leftLater = player("p-left", "2026-10-01T00:00:00Z", "2026-10-14T00:00:00Z");
  const joinedLater = player("p-new", "2026-10-14T00:00:00Z");
  const roster = [steady, leftLater, joinedLater];
  const early = at("2026-10-12T10:00:00Z");

  it("returns the roster as it was when the match started", () => {
    expect(rosterForMatch(roster, early, new Set()).map((p) => p.id)).toEqual(["p-steady", "p-left"]);
  });

  it("keeps a player who has recorded stats for the match even if the timestamps disagree", () => {
    expect(rosterForMatch(roster, early, new Set(["p-new"])).map((p) => p.id)).toEqual(["p-steady", "p-left", "p-new"]);
  });

  it("uses the current roster for a match without a reference time", () => {
    expect(rosterForMatch(roster, null, new Set()).map((p) => p.id)).toEqual(["p-steady", "p-new"]);
  });
});

describe("a player who left and came back", () => {
  // On the roster from Oct 1, off it Oct 5 to Oct 10, back since Oct 10.
  const returning = {
    ...player("p-return", "2026-10-01T00:00:00Z"),
    rosterGaps: [{ from: "2026-10-05T00:00:00.000Z", to: "2026-10-10T00:00:00.000Z" }],
  };

  it("counts for matches before the gap and after the return, not inside it", () => {
    expect(wasOnRosterAt(returning, at("2026-10-03T00:00:00Z"))).toBe(true);
    expect(wasOnRosterAt(returning, at("2026-10-07T00:00:00Z"))).toBe(false);
    expect(wasOnRosterAt(returning, at("2026-10-12T00:00:00Z"))).toBe(true);
  });

  it("treats the start of a gap as off the roster and its end as back", () => {
    expect(wasOnRosterAt(returning, at("2026-10-05T00:00:00Z"))).toBe(false);
    expect(wasOnRosterAt(returning, at("2026-10-10T00:00:00Z"))).toBe(true);
  });

  it("supports several gaps and a second departure still open", () => {
    const twice = {
      ...player("p-twice", "2026-10-01T00:00:00Z", "2026-10-20T00:00:00Z"),
      rosterGaps: [{ from: "2026-10-05T00:00:00.000Z", to: "2026-10-10T00:00:00.000Z" }, { from: "2026-10-12T00:00:00.000Z", to: "2026-10-14T00:00:00.000Z" }],
    };
    expect(wasOnRosterAt(twice, at("2026-10-13T00:00:00Z"))).toBe(false);
    expect(wasOnRosterAt(twice, at("2026-10-15T00:00:00Z"))).toBe(true);
    expect(wasOnRosterAt(twice, at("2026-10-21T00:00:00Z"))).toBe(false);
  });

  it("is expected in a not-started match once back, and not while still off", () => {
    expect(wasOnRosterAt(returning, null)).toBe(true);
    expect(wasOnRosterAt({ ...returning, removedAt: at("2026-10-15T00:00:00Z") }, null)).toBe(false);
  });
});

describe("parseRosterGaps", () => {
  it("reads valid gaps and ignores anything malformed", () => {
    expect(parseRosterGaps([{ from: "2026-10-05T00:00:00.000Z", to: "2026-10-10T00:00:00.000Z" }]))
      .toEqual([{ from: at("2026-10-05T00:00:00.000Z"), to: at("2026-10-10T00:00:00.000Z") }]);
    expect(parseRosterGaps(undefined)).toEqual([]);
    expect(parseRosterGaps(null)).toEqual([]);
    expect(parseRosterGaps("nope")).toEqual([]);
    expect(parseRosterGaps([{ from: "bad", to: "2026-10-10T00:00:00.000Z" }, { from: "2026-10-05T00:00:00.000Z" }, 7, null]))
      .toEqual([]);
  });
});
