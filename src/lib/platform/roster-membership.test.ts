import { describe, expect, it } from "vitest";
import { isActivePlayer, matchRosterReferenceTime, rosterForMatch, wasOnRosterAt } from "./roster-membership";

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
