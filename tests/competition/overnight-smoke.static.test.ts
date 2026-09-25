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

const overnightCreateTrackerMarker = "trackOvernightEvent({ name: eventName, slug });";
const overnightCreateSettlementMarker = "await runAndSettleServerActionRedirect(page, {";
const overnightCreateTriggerMarker =
  'trigger: () => createEventForm.getByRole("button", { name: /create draft event|buat draft event/i }).click(),';

function countLiteral(source: string, literal: string) {
  return source.split(literal).length - 1;
}

function assertOvernightCreateOrderContract(scenario: string) {
  const trackerIndex = scenario.indexOf(overnightCreateTrackerMarker);
  const settlementIndex = scenario.indexOf(overnightCreateSettlementMarker);
  const triggerIndex = scenario.indexOf(overnightCreateTriggerMarker);

  expect(trackerIndex).toBeGreaterThanOrEqual(0);
  expect(settlementIndex).toBeGreaterThanOrEqual(0);
  expect(triggerIndex).toBeGreaterThanOrEqual(0);
  expect(countLiteral(scenario, overnightCreateTrackerMarker)).toBe(1);
  expect(countLiteral(scenario, overnightCreateSettlementMarker)).toBe(1);
  expect(countLiteral(scenario, overnightCreateTriggerMarker)).toBe(1);
  expect(trackerIndex).toBeLessThan(settlementIndex);
  expect(settlementIndex).toBeLessThan(triggerIndex);
}

function assertExactOvernightCleanupContract(cleanup: string) {
  const normalizedCleanup = cleanup.replace(/\s+/g, " ").trim();
  const exactWhereStart = cleanup.indexOf("const exactWhere = {");
  const exactWhereEnd = cleanup.indexOf("\n  };", exactWhereStart);
  if (exactWhereStart < 0 || exactWhereEnd < 0) {
    throw new Error("cleanup must declare exactWhere");
  }
  const exactWhere = cleanup.slice(exactWhereStart, exactWhereEnd);
  for (const field of [
    "id: created.id",
    "slug: event.slug",
    "name: event.name",
    "description: created.description",
    "organizerUserId: created.organizerUserId",
  ]) {
    if (!exactWhere.includes(field)) throw new Error(`exactWhere is missing ${field}`);
  }
  if (!cleanup.includes("const result = await prisma.event.deleteMany({ where: exactWhere });")) {
    throw new Error("deleteMany must use exactWhere");
  }
  if (!normalizedCleanup.includes(
    "const isInitialState = created.description === OVERNIGHT_INITIAL_DESCRIPTION && created.organizerUserId === null;",
  )) {
    throw new Error("cleanup must retain the exact initial lifecycle whitelist");
  }
  if (!normalizedCleanup.includes(
    "const isFinalState = organizer !== null && created.description === OVERNIGHT_FINAL_DESCRIPTION && created.organizerUserId === organizer.id;",
  )) {
    throw new Error("cleanup must retain the exact final lifecycle whitelist");
  }
  const stateGuardStart = normalizedCleanup.indexOf("if (!isInitialState && !isFinalState) {");
  const stateGuardEnd = normalizedCleanup.indexOf("); }", stateGuardStart);
  const stateGuard = normalizedCleanup.slice(stateGuardStart, stateGuardEnd + 4);
  if (stateGuardStart < 0 || stateGuardEnd < 0 || !stateGuard.includes(
    "throw new Error(`Refusing to clean ${event.slug}: unexpected description/owner lifecycle state`);",
  )) {
    throw new Error("cleanup must retain lifecycle state fail-closed guard");
  }
}

describe("overnight smoke fixture cleanup contracts", () => {
  it("tracks the unique event before create and preserves the body timeout", () => {
    const scenario = sliceBetween(
      overnightSpec,
      'overnightTest("registration order stays private and imports stop after drawing publication"',
      "\n});",
    );

    expect(scenario).toContain('test.setTimeout(240_000);');
    expect(overnightSpec).toContain("const overnightTest = test.extend");
    assertOvernightCreateOrderContract(scenario);
  });

  it("rejects mutations to the scoped create settlement contract", () => {
    const scenario = sliceBetween(
      overnightSpec,
      'overnightTest("registration order stays private and imports stop after drawing publication"',
      "\n});",
    );

    const trackingAfterSettlement = scenario
      .replace(overnightCreateTrackerMarker, "")
      .replace(overnightCreateSettlementMarker, `${overnightCreateSettlementMarker}\n  ${overnightCreateTrackerMarker}`);
    const trackingAfterTrigger = scenario
      .replace(overnightCreateTrackerMarker, "")
      .replace(overnightCreateTriggerMarker, `${overnightCreateTriggerMarker}\n  ${overnightCreateTrackerMarker}`);
    const triggerRemoved = scenario.replace(overnightCreateTriggerMarker, "");
    const differentTrigger = scenario.replace(
      overnightCreateTriggerMarker,
      'trigger: () => createEventForm.getByRole("button", { name: /save event status|simpan status event/i }).click(),',
    );
    const directClickBypass = scenario.replace(
      overnightCreateSettlementMarker,
      'await createEventForm.getByRole("button", { name: /create draft event|buat draft event/i }).click();',
    );

    expect(() => assertOvernightCreateOrderContract(scenario)).not.toThrow();
    for (const mutation of [
      trackingAfterSettlement,
      trackingAfterTrigger,
      triggerRemoved,
      differentTrigger,
      directClickBypass,
    ]) {
      expect(() => assertOvernightCreateOrderContract(mutation)).toThrow();
    }
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

  it("rejects deletion and lifecycle-guard mutations", () => {
    const cleanup = sliceBetween(overnightSpec, "async function cleanupCreatedOvernightEvent", "const overnightTest = test.extend");
    const slugOnlyMutation = cleanup.replace(
      "const result = await prisma.event.deleteMany({ where: exactWhere });",
      "const result = await prisma.event.deleteMany({ where: { slug: event.slug } });",
    );
    const bypassedStateGuardMutation = cleanup.replace(
      "if (!isInitialState && !isFinalState) {",
      "if (false) {",
    );
    const unconditionalInitialStateMutation = cleanup.replace(
      /const isInitialState =\s+created\.description === OVERNIGHT_INITIAL_DESCRIPTION && created\.organizerUserId === null;/,
      "const isInitialState = true;",
    );
    const unconditionalFinalStateMutation = cleanup.replace(
      /const isFinalState =\s+organizer !== null &&\s+created\.description === OVERNIGHT_FINAL_DESCRIPTION &&\s+created\.organizerUserId === organizer\.id;/,
      "const isFinalState = true;",
    );
    expect(slugOnlyMutation).not.toBe(cleanup);
    expect(bypassedStateGuardMutation).not.toBe(cleanup);
    expect(unconditionalInitialStateMutation).not.toBe(cleanup);
    expect(unconditionalFinalStateMutation).not.toBe(cleanup);
    expect(() => assertExactOvernightCleanupContract(cleanup)).not.toThrow();
    expect(() => assertExactOvernightCleanupContract(slugOnlyMutation)).toThrow(/deleteMany/);
    expect(() => assertExactOvernightCleanupContract(bypassedStateGuardMutation)).toThrow(/lifecycle state/);
    expect(() => assertExactOvernightCleanupContract(unconditionalInitialStateMutation)).toThrow(/initial lifecycle/);
    expect(() => assertExactOvernightCleanupContract(unconditionalFinalStateMutation)).toThrow(/final lifecycle/);
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
