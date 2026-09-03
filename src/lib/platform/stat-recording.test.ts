import { describe, expect, it } from "vitest";
import { getTeamStatRecording, getMatchStatRecording } from "./stat-recording";

const players = [{ id: "p1" }, { id: "p2" }];
const keys = ["goal", "assist"];
const zeros = { goal: 0, assist: 0 };

describe("statistics recording completeness", () => {
  it("does not count unsaved form defaults", () => {
    expect(getTeamStatRecording(players, keys, {})).toBe("unrecorded");
  });

  it.each([
    [{ p1: zeros }],
    [{ p1: zeros, p2: { goal: 1 } }],
    [{ p1: zeros, p2: { goal: 1, assist: null } }],
    [{ p1: zeros, p2: { goal: "0", assist: 0 } }],
  ])("does not mark partial saves or missing numeric fields complete: %j", (stats) => {
    expect(getTeamStatRecording(players, keys, stats)).toBe("partial");
  });

  it("counts saved zero values and edited values as complete", () => {
    expect(getTeamStatRecording(players, keys, { p1: zeros, p2: zeros })).toBe("recorded");
    expect(getTeamStatRecording(players, keys, { p1: { goal: 3, assist: 1 }, p2: zeros })).toBe("recorded");
  });

  it("requires a nonempty roster and ignores stats belonging to former players", () => {
    expect(getTeamStatRecording([], keys, { p1: zeros })).toBe("missingRoster");
    expect(getTeamStatRecording([{ id: "new" }], keys, { p1: zeros })).toBe("unrecorded");
    expect(getTeamStatRecording([...players, { id: "new" }], keys, { p1: zeros, p2: zeros })).toBe("partial");
  });

  it.each([
    ["unrecorded", "unrecorded", "unrecorded"],
    ["recorded", "unrecorded", "partial"],
    ["partial", "partial", "partial"],
    ["recorded", "recorded", "recorded"],
    ["recorded", "missingRoster", "partial"],
    ["missingRoster", "missingRoster", "unrecorded"],
  ] as const)("combines %s and %s into %s", (home, away, expected) => {
    expect(getMatchStatRecording(home, away)).toBe(expected);
  });

  it("leaves matches without configured statistics completed", () => {
    const team = getTeamStatRecording(players, [], {});
    expect(team).toBe("notRequired");
    expect(getMatchStatRecording(team, team)).toBe("notRequired");
  });
});
