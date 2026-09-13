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
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
}

test("homepage and Event Center expose the live-first discovery experience without overflow", async ({ page }) => {
  await page.goto("/id");
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Navigasi event utama" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Event lain" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Lihat semua event" }).first()).toBeVisible();
    await expectNoDocumentOverflow(page);
  }

  await page.goto("/id/events");
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { level: 1, name: "Event Center" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Filter status" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Filter game" })).toBeVisible();
    await expectNoDocumentOverflow(page);
  }

  const finished = page.getByRole("navigation", { name: "Filter status" })
    .getByRole("link", { name: /^Selesai [0-9]+$/ });
  await finished.click();
  await expect(page).toHaveURL(/\/id\/events\?status=finished$/);
  await expect(finished).toHaveAttribute("aria-current", "page");

  await page.goto("/en/events");
  await expect(page.getByText("Find live events, upcoming registrations, and the official results archive.")).toBeVisible();
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
