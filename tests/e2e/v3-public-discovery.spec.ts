import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 900 },
] as const;

async function expectNoDocumentOverflow(page: import("@playwright/test").Page) {
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth, page.url()).toBeLessThanOrEqual(geometry.clientWidth);
}

test("homepage and Event Center expose the live-first discovery experience without overflow", async ({ page }) => {
  await page.goto("/id");
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Navigasi event utama" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Event lain" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Lihat semua event" }).first()).toBeVisible();
    await expect(page.locator("header")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.locator("[data-public-v3-event]")).toHaveAttribute("data-public-source", /authoritative|compatible/);
    const hero = page.locator("[data-featured-event]");
    const poster = hero.locator(".mpv3-poster-stage");
    await expect(poster).toBeVisible();
    const flow = await hero.evaluate((element) => {
      const copy = element.querySelector(".mpv3-hero-copy")!.getBoundingClientRect();
      const facts = element.querySelector(".mpv3-fact-strip")!.getBoundingClientRect();
      return { copyBottom: copy.bottom, factsTop: facts.top };
    });
    expect(flow.factsTop).toBeGreaterThanOrEqual(flow.copyBottom);
    if (viewport.width === 390 || viewport.width === 1440) {
      await page.screenshot({ path: `test-results/task-5-homepage-${viewport.width}.png`, fullPage: true });
    }
    await expectNoDocumentOverflow(page);
  }

  await page.goto("/id/events");
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { level: 1, name: "Satu panggung utama. Semua cerita tetap hidup." })).toBeVisible();
    await expect(page.locator("header")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.locator("[data-lifecycle]")).toHaveCount(3);
    const grid = page.locator(".mpv3-directory-grid").first();
    await expect(grid).toBeVisible();
    const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(viewport.width <= 580 ? 1 : 2);
    if (viewport.width === 390 || viewport.width === 1440) {
      await page.screenshot({ path: `test-results/task-6-event-center-${viewport.width}.png`, fullPage: true });
    }
    await expect(page.getByRole("navigation", { name: "Filter status" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Filter game" })).toBeVisible();
    await expectNoDocumentOverflow(page);
  }

  const finished = page.getByRole("navigation", { name: "Filter status" })
    .getByRole("link", { name: /^Selesai [0-9]+$/ });
  await finished.click();
  await expect(page).toHaveURL(/\/id\/events\?status=finished$/);
  await expect(finished).toHaveAttribute("aria-current", "page");

  const flashpeak = page.getByRole("navigation", { name: "Filter game" }).getByRole("link", { name: "Flashpeak", exact: true });
  await flashpeak.click();
  await expect(page).toHaveURL(/\/id\/events\?game=game-flashpeak&status=finished$/);
  await expect(flashpeak).toHaveAttribute("aria-current", "page");
  const sharedUrl = page.url();
  await page.goBack();
  await expect(page).toHaveURL(/\/id\/events\?status=finished$/);
  await page.goForward();
  await expect(page).toHaveURL(sharedUrl);
  await expect(flashpeak).toHaveAttribute("aria-current", "page");
  await page.goto(sharedUrl);
  await expect(finished).toHaveAttribute("aria-current", "page");
  await expect(flashpeak).toHaveAttribute("aria-current", "page");

  await page.goto("/en/events");
  await expect(page.getByText("Find live events, upcoming registrations, and the official results archive.")).toBeVisible();
  await page.goto("/en/events?game=unknown&game=game-flashpeak&game=game-other&status=&status=finished&status=ongoing");
  const englishStatus = page.getByRole("navigation", { name: "Status filters" }).locator('a[aria-current="page"]');
  await expect(englishStatus).toHaveAttribute("href", "/en/events?game=game-flashpeak&status=finished");
  await expect(page.getByRole("navigation", { name: "Game filters" }).locator('a[aria-current="page"]')).toHaveText("Flashpeak");
  await page.goto("/en/events?game=&status=unknown");
  await expect(englishStatus).toHaveAttribute("href", "/en/events");
  await expect(page.getByRole("navigation", { name: "Game filters" }).locator('a[aria-current="page"]')).toHaveText("All games");
});

test("public detail routes remain reachable and leaderboard sorts all six parameters", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const slug = "flashpeak-champions-32";

  for (const route of ["participants", "schedule", "bracket", "leaderboards"]) {
    const response = await page.goto(`/id/events/${slug}/${route}`);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("main")).toBeVisible();
    await expectNoDocumentOverflow(page);
    if (route === "participants") {
      const trigger = page.getByRole("button", { name: /Lihat roster/ }).first();
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: /.+/ });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole("button", { name: "Tutup" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  }

  await expect(page.getByPlaceholder("Cari pemain")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Semua tim" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Semua posisi" })).toBeVisible();

  for (const key of ["game", "score", "goal", "assist", "passing", "defense"]) {
    const button = page.locator(`button[data-sort-key="${key}"]`);
    const heading = button.locator("..");
    await expect(button).toBeVisible();
    const before = await heading.getAttribute("aria-sort");
    await button.click();
    const afterFirst = await heading.getAttribute("aria-sort");
    expect(afterFirst).toMatch(/ascending|descending/);
    expect(afterFirst).not.toBe(before);
    await button.click();
    const afterSecond = await heading.getAttribute("aria-sort");
    expect(afterSecond).toMatch(/ascending|descending/);
    expect(afterSecond).not.toBe(afterFirst);
  }
});
