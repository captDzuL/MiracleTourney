import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "tests/e2e/v3-public-discovery.spec.ts"),
  "utf8",
);

function testSection(title: string) {
  const start = source.indexOf(`test("${title}`);
  const nextTest = source.indexOf("\ntest(", start + 1);
  return start < 0 ? "" : source.slice(start, nextTest < 0 ? source.length : nextTest);
}

const homepage = testSection("homepage geometry");
const eventCenter = testSection("Event Center geometry and filter history");
const englishNormalization = testSection("English query normalization");

describe("public discovery test boundaries", () => {
  it("replaces the monolith with exactly three independently named tests", () => {
    expect(source).not.toContain(
      'test("homepage and Event Center expose the live-first discovery experience without overflow"',
    );
    for (const title of [
      "homepage geometry",
      "Event Center geometry and filter history",
      "English query normalization",
    ]) {
      expect(source.match(new RegExp(`test\\(\\"${title}`, "g")) ?? []).toHaveLength(1);
    }
  });

  it("keeps all homepage assertions, one viewport loop, and both geometry screenshots", () => {
    expect(homepage).toContain('await page.goto("/id");');
    expect(homepage.match(/for \(const viewport of VIEWPORTS\)/g) ?? []).toHaveLength(1);
    for (const assertion of [
      'getByRole("heading", { level: 1 })',
      'getByRole("navigation", { name: "Navigasi event utama" })',
      'getByRole("heading", { name: "Event lain" })',
      'getByRole("link", { name: "Lihat semua event" }).first()',
      'locator("header")',
      'getByRole("main")',
      'locator("[data-public-v3-event]")',
      'locator("[data-featured-event]")',
      'locator(".mpv3-poster-stage")',
      "flow.factsTop).toBeGreaterThanOrEqual(flow.copyBottom)",
      "await expectNoDocumentOverflow(page)",
    ]) expect(homepage).toContain(assertion);
    expect(homepage).toContain("viewport.width === 390 || viewport.width === 1440");
    expect(homepage).toContain("test-results/task-5-homepage-${viewport.width}.png");
  });

  it("keeps Event Center geometry, filter history, and both geometry screenshots", () => {
    expect(eventCenter).toContain('await page.goto("/id/events");');
    expect(eventCenter.match(/for \(const viewport of VIEWPORTS\)/g) ?? []).toHaveLength(1);
    for (const assertion of [
      'getByRole("heading", { level: 1, name: "Satu panggung utama. Semua cerita tetap hidup." })',
      'locator("header")',
      'getByRole("main")',
      'locator("[data-lifecycle]")',
      'locator(".mpv3-directory-grid").first()',
      "columns).toBe(viewport.width <= 580 ? 1 : 2)",
      'getByRole("navigation", { name: "Filter status" })',
      'getByRole("navigation", { name: "Filter game" })',
      "await expectNoDocumentOverflow(page)",
      'getByRole("link", { name: /^Selesai [0-9]+$/ })',
      'toHaveURL(/\\/id\\/events\\?status=finished$/)',
      'toHaveURL(/\\/id\\/events\\?game=game-flashpeak&status=finished$/)',
      'toHaveAttribute("aria-current", "page")',
      "await page.goBack()",
      "await page.goForward()",
      "const sharedUrl = page.url()",
      "await page.goto(sharedUrl)",
    ]) expect(eventCenter).toContain(assertion);
    expect(eventCenter).toContain("viewport.width === 390 || viewport.width === 1440");
    expect(eventCenter).toContain("test-results/task-6-event-center-${viewport.width}.png");
  });

  it("keeps localized English intro and both query-normalization cases", () => {
    expect(englishNormalization).toContain('await page.goto("/en/events");');
    expect(englishNormalization).toContain(
      "Find live events, upcoming registrations, and the official results archive.",
    );
    expect(englishNormalization).toContain(
      '/en/events?game=unknown&game=game-flashpeak&game=game-other&status=&status=finished&status=ongoing',
    );
    expect(englishNormalization).toContain(
      'toHaveAttribute("href", "/en/events?game=game-flashpeak&status=finished")',
    );
    expect(englishNormalization).toContain('await page.goto("/en/events?game=&status=unknown");');
    expect(englishNormalization).toContain('toHaveAttribute("href", "/en/events")');
    expect(englishNormalization).toContain('toHaveText("All games")');
  });

  it("retains ten viewport passes and four conditional screenshot executions", () => {
    expect(source.match(/for \(const viewport of VIEWPORTS\)/g) ?? []).toHaveLength(2);
    expect(source.match(/page\.screenshot\(/g) ?? []).toHaveLength(2);
    expect(source.match(/viewport\.width === 390 \|\| viewport\.width === 1440/g) ?? []).toHaveLength(2);
  });

  it("does not override Playwright timeout, retries, or skip behavior", () => {
    expect(source).not.toMatch(/test\.(?:setTimeout|slow|skip|fixme)|waitForTimeout|retries\s*:/);
  });
});
