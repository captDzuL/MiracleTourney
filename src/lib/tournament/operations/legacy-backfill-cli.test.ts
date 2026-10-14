import { describe, expect, it } from "vitest";
import { planLegacyBackfill } from "./legacy-backfill";
import { describeBackfillResult, parseBackfillArgs, summarizePlan } from "./legacy-backfill-cli";
import { legacyFixture } from "./legacy-backfill-fixtures";

describe("backfill command line", () => {
  it("is a dry run unless --apply is given", () => {
    expect(parseBackfillArgs([])).toEqual({ refs: [], apply: false, actorUser: null, jsonPath: null, errors: [] });
    expect(parseBackfillArgs(["mfl-s3"]).apply).toBe(false);
  });

  it("reads refs, --apply, --actor-user and --json", () => {
    expect(parseBackfillArgs(["mfl-s3", "--apply", "--actor-user", "u1", "other", "--json", "out.json"]))
      .toEqual({ refs: ["mfl-s3", "other"], apply: true, actorUser: "u1", jsonPath: "out.json", errors: [] });
  });

  it("reports a missing value or an unknown option instead of ignoring it", () => {
    expect(parseBackfillArgs(["--actor-user"]).errors).toEqual(["--actor-user needs a value"]);
    expect(parseBackfillArgs(["--actor-user", "--apply"]).errors).toEqual(["--actor-user needs a value"]);
    expect(parseBackfillArgs(["--aply"]).errors).toEqual(["unknown option --aply"]);
  });
});

describe("backfill report", () => {
  it("lists problems one per line", () => {
    const lines = describeBackfillResult({ ok: false, problems: ["a", "b"] }, []);
    expect(lines).toEqual(["  PROBLEMS (2) - nothing can be written:", "    - a", "    - b"]);
  });

  it("shows the champion, podium, created match and warnings by team name", () => {
    const fixture = legacyFixture({ eventId: "s3", teamCount: 26, bestOf: { final: 3 }, withThirdPlace: true, organizerUserId: null });
    const result = planLegacyBackfill(fixture.input);
    const text = describeBackfillResult(result, fixture.input.teams).join("\n");
    expect(text).toContain("PLAN OK: 25 matches");
    expect(text).toContain("final: Team 1 beat Team 2 (official: yes)");
    expect(text).toContain("3 Evrosheim");
    expect(text).toContain("created s3:third_place:r1:m1");
    expect(text).toContain("WARNING: organizerUserId is NULL");
    expect(text).toContain("MISSING_VALIDATED_AWARD_STATISTICS top_scorer");
    expect(text).toContain("validated award statistics (players): mvp 0");
  });

  it("summarizes a plan without the graph", () => {
    const fixture = legacyFixture({ eventId: "s2", teamCount: 29, bestOf: { early: 3, semifinals: 3, final: 5 } });
    const result = planLegacyBackfill(fixture.input);
    if (!result.ok) throw new Error(result.problems.join("|"));
    expect(summarizePlan(result.plan)).toMatchObject({ seeds: 29, byeNodes: 3, matchesUpdated: 28, matchesCreated: [], revisions: 28 });
  });
});
