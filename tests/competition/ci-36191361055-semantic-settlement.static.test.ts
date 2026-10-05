import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readSourceText } from "./source-text";

const root = resolve(import.meta.dirname, "../..");
const organizer = readSourceText(resolve(root, "tests/e2e/v3-organizer-lifecycle.spec.ts"));

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

function qrisBlock(source: string) {
  return sliceBetween(
    source,
    'await expectLocalizedRegistrationSurface(page, registrationFixture, locale, "qris");',
    "await expectDialogEscapeRestoresFocus",
  );
}

function qrisSettlementParts(source: string) {
  const qris = qrisBlock(source);
  const firstSettlement = qris.indexOf("await runAndSettleServerActionUi(page, {");
  const publicationSettlement = qris.indexOf("await runAndSettleServerActionUi(page, {", firstSettlement + 1);
  if (firstSettlement < 0 || publicationSettlement < 0) throw new Error("QRIS draft and publication settlements must both be explicit");
  return { draft: qris.slice(0, publicationSettlement), publication: qris.slice(publicationSettlement) };
}

function assertQrisDraftSettlement(source: string) {
  const { draft } = qrisSettlementParts(source);
  expect(draft).toContain("await runAndSettleServerActionUi(page, {");
  expect(draft).toContain(
    'requestUrl.pathname === `/${locale}/organizer/events/${encodeURIComponent(fixture.registrationEventId)}/registration`',
  );
  expect(draft).toContain('requestUrl.search === "?view=qris"');
  expect(draft).toContain('trigger: () => page.locator("[data-save]").click(),');
  expect(draft).toContain(
    "uiReady: () => expectLocalizedText(page, copy.qrisDraftSaved, copy.opposite.qrisDraftSaved),",
  );
  expect(draft).toContain('expect.poll(async () => (await fixture.readState()).qris?.status).toBe("draft");');
  expect(draft).toContain('expect(savedQris.qris?.version).toBe(fixture.qrisVersion + 1);');
  expect(draft.indexOf("await runAndSettleServerActionUi(page, {")).toBeLessThan(
    draft.indexOf('expect.poll(async () => (await fixture.readState()).qris?.status).toBe("draft");'),
  );
  expect(draft.indexOf("uiReady: () => expectLocalizedText(page, copy.qrisDraftSaved, copy.opposite.qrisDraftSaved),")).toBeLessThan(
    draft.indexOf('expect.poll(async () => (await fixture.readState()).qris?.status).toBe("draft");'),
  );
  expect(draft.indexOf('expect.poll(async () => (await fixture.readState()).qris?.status).toBe("draft");')).toBeLessThan(
    draft.indexOf('expect(savedQris.qris?.version).toBe(fixture.qrisVersion + 1);'),
  );
  expect(draft).not.toMatch(/waitForTimeout|\bretr(?:y|ies)\b|response\.(?:finished|text)\(\)|request(?:finished|failed)/);
}

function assertQrisPublicationSettlement(source: string) {
  const { publication } = qrisSettlementParts(source);
  expect(publication).toContain("await runAndSettleServerActionUi(page, {");
  expect(publication).toContain(
    'requestUrl.pathname === `/${locale}/organizer/events/${encodeURIComponent(fixture.registrationEventId)}/registration`',
  );
  expect(publication).toContain('requestUrl.search === "?view=qris"');
  expect(publication).toContain('trigger: () => page.locator("[data-publish]").click(),');
  expect(publication).toContain(
    "uiReady: () => expectLocalizedText(page, copy.qrisPublished, copy.opposite.qrisPublished),",
  );
  expect(publication).toContain('expect.poll(async () => (await fixture.readState()).qris?.status).toBe("published");');
  expect(publication).toContain(
    'expect(receipt.qris).toMatchObject({ eventId: fixture.registrationEventId, status: "published", version: fixture.qrisVersion + 2 });',
  );
  expect(publication.indexOf("await runAndSettleServerActionUi(page, {")).toBeLessThan(
    publication.indexOf('expect.poll(async () => (await fixture.readState()).qris?.status).toBe("published");'),
  );
  expect(publication.indexOf('uiReady: () => expectLocalizedText(page, copy.qrisPublished, copy.opposite.qrisPublished),')).toBeLessThan(
    publication.indexOf('expect.poll(async () => (await fixture.readState()).qris?.status).toBe("published");'),
  );
  expect(publication.indexOf('expect.poll(async () => (await fixture.readState()).qris?.status).toBe("published");')).toBeLessThan(
    publication.indexOf('expect(receipt.qris).toMatchObject({ eventId: fixture.registrationEventId, status: "published", version: fixture.qrisVersion + 2 });'),
  );
  expect(publication).not.toMatch(/waitForTimeout|\bretr(?:y|ies)\b|response\.(?:finished|text)\(\)|request(?:finished|failed)/);
}

function assertQrisSettlement(source: string) {
  assertQrisDraftSettlement(source);
  assertQrisPublicationSettlement(source);
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

function completionBlock(source: string) {
  const startMarker = "await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/completion`);";
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Unable to isolate contract block: ${startMarker}`);
  return source.slice(start);
}

function assertCompletionSettlement(source: string) {
  const completion = completionBlock(source);
  expect(completion).toContain("const completionPath = `/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/completion`;");
  expect(completion).toContain("await runAndSettleServerActionUi(page, {");
  expect(completion).toContain("requestUrl.pathname === completionPath");
  expect(completion).toContain('requestUrl.search === ""');
  expect(completion).toContain('Boolean(request.headers()["next-action"])');
  expect(completion).toContain('(request.postData() ?? "").includes(fixture.id)');
  expect(completion).toContain('trigger: () => page.locator("[data-complete-tournament]").click(),');
  expect(completion).toContain("uiReady: () => expectLocalizedText(page, copy.completionFeedback, copy.opposite.completionFeedback),");
  expect(completion).toContain('await expect(page.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", copy.completionStatus);');
  expect(completion).toContain('expect.poll(async () => (await fixture.readState()).completion?.status).toBe("completed");');
  expect(completion).toContain('expect(receipt.completion).toMatchObject({ status: "completed" });');
  expect(completion).toContain("expect(receipt.completion?.id).toBeTruthy();");
  expect(completion).toContain("expect(receipt.completion?.completedAt).toBeTruthy();");
  expect(completion.indexOf("const completionPath =")).toBeLessThan(completion.indexOf("await runAndSettleServerActionUi(page, {"));
  expect(completion.indexOf("await runAndSettleServerActionUi(page, {")).toBeLessThan(
    completion.indexOf("uiReady: () => expectLocalizedText(page, copy.completionFeedback, copy.opposite.completionFeedback),"),
  );
  expect(completion.indexOf("uiReady: () => expectLocalizedText(page, copy.completionFeedback, copy.opposite.completionFeedback),")).toBeLessThan(
    completion.indexOf('await expect(page.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", copy.completionStatus);'),
  );
  expect(completion.indexOf('await expect(page.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", copy.completionStatus);')).toBeLessThan(
    completion.indexOf('expect.poll(async () => (await fixture.readState()).completion?.status).toBe("completed");'),
  );
  expect(completion.indexOf('expect.poll(async () => (await fixture.readState()).completion?.status).toBe("completed");')).toBeLessThan(
    completion.indexOf('expect(receipt.completion).toMatchObject({ status: "completed" });'),
  );
  expect(completion).not.toMatch(/waitForTimeout|\bretr(?:y|ies)\b|response\.(?:finished|text)\(\)|request(?:finished|failed)/);
}

describe("CI 36191361055 semantic organizer settlement contracts", () => {
  it("settles QRIS publication on the exact response and localized success before the receipt", () => {
    assertQrisSettlement(partA);
  });

  it("settles official-result submission on the exact response and mode-localized success before the receipt", () => {
    assertResultSettlement(partA);
  });

  it("settles Completion on the exact response and localized success before the receipt", () => {
    assertCompletionSettlement(partA);
  });

  it("rejects QRIS settlement mutations", () => {
    assertQrisSettlement(partA);
    expect(() => assertQrisDraftSettlement(partA.replace('trigger: () => page.locator("[data-save]").click(),', 'await page.locator("[data-save]").click();'))).toThrow();
    expect(() => assertQrisDraftSettlement(partA.replace('requestUrl.search === "?view=qris"', 'requestUrl.search === ""'))).toThrow();
    expect(() => assertQrisDraftSettlement(partA.replace("uiReady: () => expectLocalizedText(page, copy.qrisDraftSaved, copy.opposite.qrisDraftSaved),", "uiReady: () => undefined,"))).toThrow();
    expect(() => assertQrisDraftSettlement(partA.replace('expect(savedQris.qris?.version).toBe(fixture.qrisVersion + 1);', 'expect(savedQris.qris?.version).toBe(fixture.qrisVersion);'))).toThrow();
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

  it("rejects Completion settlement mutations", () => {
    assertCompletionSettlement(partA);
    expect(() => assertCompletionSettlement(partA.replace(
      "const completionPath = `/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/completion`;\n  await runAndSettleServerActionUi(page, {",
      'const completionPath = `/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/completion`;\n  await page.locator("[data-complete-tournament]").click();',
    ))).toThrow();
    expect(() => assertCompletionSettlement(partA.replace("requestUrl.pathname === completionPath\n      && requestUrl.search === \"\"", "requestUrl.pathname === completionPath"))).toThrow();
    expect(() => assertCompletionSettlement(partA.replace('&& Boolean(request.headers()["next-action"])', ""))).toThrow();
    expect(() => assertCompletionSettlement(partA.replace('(request.postData() ?? "").includes(fixture.id)', "true"))).toThrow();
    expect(() => assertCompletionSettlement(partA.replace("uiReady: () => expectLocalizedText(page, copy.completionFeedback, copy.opposite.completionFeedback),", "uiReady: () => undefined,"))).toThrow();
    expect(() => assertCompletionSettlement(partA.replace('await expect(page.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", copy.completionStatus);', ""))).toThrow();
    expect(() => assertCompletionSettlement(partA.replace('expect.poll(async () => (await fixture.readState()).completion?.status).toBe("completed");', ""))).toThrow();
    expect(() => assertCompletionSettlement(partA.replace("expect(receipt.completion?.id).toBeTruthy();", ""))).toThrow();
    expect(() => assertCompletionSettlement(partA.replace("expect(receipt.completion?.completedAt).toBeTruthy();", ""))).toThrow();
  });
});
