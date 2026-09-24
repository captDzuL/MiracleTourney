import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const overnightSpec = readFileSync(resolve(root, "tests/e2e/overnight-smoke.spec.ts"), "utf8");

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Unable to isolate contract block: ${startMarker}`);
  return source.slice(start, end);
}

describe("overnight smoke fixture cleanup contracts", () => {
  it("tracks the unique event before create and preserves the body timeout", () => {
    const scenario = overnightSpec.slice(overnightSpec.indexOf("registration order stays private and imports stop after drawing publication"));
    const createClick = scenario.indexOf("create draft event|buat draft event/i }).click();");
    const trackerCall = scenario.indexOf("trackOvernightEvent({ name: eventName, slug });");

    expect(overnightSpec).toContain('test.setTimeout(240_000);');
    expect(overnightSpec).toContain("const overnightTest = test.extend");
    expect(overnightSpec).toContain("trackOvernightEvent");
    expect(trackerCall).toBeGreaterThanOrEqual(0);
    expect(createClick).toBeGreaterThan(trackerCall);
  });

  it("uses timeout-isolated teardown with the exact lifecycle fingerprint", () => {
    const fixtureStart = overnightSpec.indexOf("const overnightTest = test.extend");
    const fixtureEnd = overnightSpec.indexOf('overnightTest("registration order stays private', fixtureStart);
    expect(fixtureStart).toBeGreaterThanOrEqual(0);
    expect(fixtureEnd).toBeGreaterThan(fixtureStart);
    const fixture = overnightSpec.slice(fixtureStart, fixtureEnd);
    const cleanup = sliceBetween(overnightSpec, "async function cleanupCreatedOvernightEvent", "const overnightTest = test.extend");

    expect(overnightSpec).toContain("const OVERNIGHT_CLEANUP_TIMEOUT = 30_000");
    expect(fixture).toContain("await use(trackOvernightEvent)");
    expect(fixture).toContain("timeout: OVERNIGHT_CLEANUP_TIMEOUT");
    expect(fixture.indexOf("await use(trackOvernightEvent)")).toBeLessThan(
      fixture.indexOf("cleanupCreatedOvernightEvent(trackedEvent)"),
    );

    expect(cleanup).toContain("findMany");
    expect(cleanup).toContain("slug: event.slug");
    expect(cleanup).toContain("name: event.name");
    expect(cleanup).toContain("description");
    expect(cleanup).toContain("organizerUserId");
    expect(cleanup).toContain("if (rows.length > 1)");
    expect(cleanup).toContain("deleteMany");
    expect(cleanup).toContain("id: created.id");
    expect(cleanup).toContain("slug: event.slug");
    expect(cleanup).toContain("name: event.name");
    expect(cleanup).toContain("description: created.description");
    expect(cleanup).toContain("organizerUserId: created.organizerUserId");
    expect(cleanup).toContain("result.count !== 1");
    expect(cleanup).toContain("remaining");
    expect(cleanup).toContain("remaining !== 0");
    expect(overnightSpec).toContain('"New event created from admin panel."');
    expect(overnightSpec).toContain('"Ready legacy admin event for V3 publish readiness coverage."');
    expect(overnightSpec).toContain('"organizer-a@miraclefc.gg"');
    expect(cleanup).not.toMatch(/slug:\s*\{\s*(startsWith|contains|endsWith):/);
    expect(cleanup).not.toContain("event.deleteMany({});");
    expect(cleanup).not.toContain("user.delete");
    expect(cleanup).not.toContain("user.deleteMany");
  });

  it("routes the scenario through the cleanup fixture without changing assertions", () => {
    const scenario = sliceBetween(
      overnightSpec,
      'registration order stays private and imports stop after drawing publication',
      "\n});",
    );
    expect(overnightSpec).toContain('overnightTest("registration order stays private and imports stop after drawing publication"');
    expect(scenario).toContain("trackOvernightEvent({ name: eventName, slug });");
    expect(scenario).toContain("await expect(page.getByText(\"Team 23\", { exact: true })).toBeVisible();");
    expect(scenario).toContain("await expect(lockedPreview.getByRole(\"button\"");
  });
});
