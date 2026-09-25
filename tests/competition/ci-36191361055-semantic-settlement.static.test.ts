import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const organizer = readFileSync(resolve(root, "tests/e2e/v3-organizer-lifecycle.spec.ts"), "utf8");

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Unable to isolate contract block: ${startMarker}`);
  return source.slice(start, end);
}

const partA = sliceBetween(
  organizer,
  "async function runOrganizerReleaseJourneyPartA",
  "async function runOrganizerReleaseJourneyPartB",
);

function assertQrisSettlement(source: string) {
  const qris = sliceBetween(
    source,
    'await expectLocalizedRegistrationSurface(page, registrationFixture, locale, "qris");',
    "await expectDialogEscapeRestoresFocus",
  );
  expect(qris).toContain("await runAndSettleServerActionUi(page, {");
  expect(qris).toContain(
    'requestUrl.pathname === `/${locale}/organizer/events/${encodeURIComponent(fixture.registrationEventId)}/registration`',
  );
  expect(qris).toContain('requestUrl.search === "?view=qris"');
  expect(qris).toContain('trigger: () => page.locator("[data-publish]").click(),');
  expect(qris).toContain(
    "uiReady: () => expectLocalizedText(page, copy.qrisPublished, copy.opposite.qrisPublished),",
  );
  expect(qris).toContain('expect.poll(async () => (await fixture.readState()).qris?.status).toBe("published");');
  expect(qris).toContain(
    'expect(receipt.qris).toMatchObject({ eventId: fixture.registrationEventId, status: "published", version: fixture.qrisVersion + 2 });',
  );
  expect(qris.indexOf("await runAndSettleServerActionUi(page, {")).toBeLessThan(
    qris.indexOf('expect.poll(async () => (await fixture.readState()).qris?.status).toBe("published");'),
  );
  expect(qris.indexOf('uiReady: () => expectLocalizedText(page, copy.qrisPublished, copy.opposite.qrisPublished),')).toBeLessThan(
    qris.indexOf('expect.poll(async () => (await fixture.readState()).qris?.status).toBe("published");'),
  );
  expect(qris.indexOf('expect.poll(async () => (await fixture.readState()).qris?.status).toBe("published");')).toBeLessThan(
    qris.indexOf('expect(receipt.qris).toMatchObject({ eventId: fixture.registrationEventId, status: "published", version: fixture.qrisVersion + 2 });'),
  );
  expect(qris).not.toMatch(/waitForTimeout|\bretr(?:y|ies)\b|response\.(?:finished|text)\(\)|request(?:finished|failed)/);
}

function assertResultSettlement(source: string) {
  const result = sliceBetween(
    source,
    "const resultForm = page.getByRole(\"form\", { name: copy.officialResultHeading, exact: true });",
    "await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/matches/${encodeURIComponent(matchId!)}?view=statistics`);",
  );
  expect(result).toContain("const resultPath = `/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/matches/${encodeURIComponent(matchId!)}`;");
  expect(result).toContain("const resultSaved = mode === \"on\" ? copy.statisticsSaved : copy.legacyOperationSaved;");
  expect(result).toContain("const oppositeResultSaved = mode === \"on\" ? copy.opposite.statisticsSaved : copy.opposite.legacyOperationSaved;");
  expect(result).toContain("await runAndSettleServerActionUi(page, {");
  expect(result).toContain("requestUrl.pathname === resultPath && requestUrl.search === \"\"");
  expect(result).toContain(
    'trigger: () => resultForm.getByRole("button", { name: copy.submitResult, exact: true }).click(),',
  );
  expect(result).toContain("uiReady: () => expectLocalizedText(page, resultSaved, oppositeResultSaved),");
  expect(result).toContain('expect.poll(async () => (await fixture.readState()).match?.resultVersion).toBe(1);');
  expect(result).toContain(
    'expect(receipt.match).toMatchObject({ id: matchId, eventId: fixture.id, resultVersion: 1, status: "Completed", homeScore: 2, awayScore: 1 });',
  );
  expect(result.indexOf("await runAndSettleServerActionUi(page, {")).toBeLessThan(
    result.indexOf('expect.poll(async () => (await fixture.readState()).match?.resultVersion).toBe(1);'),
  );
  expect(result.indexOf("uiReady: () => expectLocalizedText(page, resultSaved, oppositeResultSaved),")).toBeLessThan(
    result.indexOf('expect.poll(async () => (await fixture.readState()).match?.resultVersion).toBe(1);'),
  );
  expect(result.indexOf('expect.poll(async () => (await fixture.readState()).match?.resultVersion).toBe(1);')).toBeLessThan(
    result.indexOf(
      'expect(receipt.match).toMatchObject({ id: matchId, eventId: fixture.id, resultVersion: 1, status: "Completed", homeScore: 2, awayScore: 1 });',
    ),
  );
  expect(result).not.toMatch(/waitForTimeout|\bretr(?:y|ies)\b|response\.(?:finished|text)\(\)|request(?:finished|failed)/);
}

describe("CI 36191361055 semantic organizer settlement contracts", () => {
  it("settles QRIS publication on the exact response and localized success before the receipt", () => {
    assertQrisSettlement(partA);
  });

  it("settles official-result submission on the exact response and mode-localized success before the receipt", () => {
    assertResultSettlement(partA);
  });

  it("rejects QRIS settlement mutations", () => {
    assertQrisSettlement(partA);
    expect(() => assertQrisSettlement(partA.replace('requestUrl.search === "?view=qris"', 'requestUrl.search === ""'))).toThrow();
    expect(() => assertQrisSettlement(partA.replace("uiReady: () => expectLocalizedText(page, copy.qrisPublished, copy.opposite.qrisPublished),", "uiReady: () => undefined,"))).toThrow();
    expect(() => assertQrisSettlement(partA.replace('status: "published", version: fixture.qrisVersion + 2', 'status: "draft", version: fixture.qrisVersion + 2'))).toThrow();
  });

  it("rejects official-result settlement mutations", () => {
    assertResultSettlement(partA);
    expect(() => assertResultSettlement(partA.replace("requestUrl.pathname === resultPath && requestUrl.search === \"\"", "requestUrl.pathname === resultPath"))).toThrow();
    expect(() => assertResultSettlement(partA.replace("uiReady: () => expectLocalizedText(page, resultSaved, oppositeResultSaved),", "uiReady: () => undefined,"))).toThrow();
    expect(() => assertResultSettlement(partA.replace('resultVersion: 1, status: "Completed"', 'resultVersion: 0, status: "Completed"'))).toThrow();
  });
});
