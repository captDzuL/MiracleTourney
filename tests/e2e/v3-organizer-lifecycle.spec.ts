import { expect, test } from "@playwright/test";

import { loginAsOrganizer } from "./helpers/auth";

function eventIdentity() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: `V3 Lifecycle ${suffix}`,
    slug: `v3-lifecycle-${suffix}`,
  };
}

test.describe("V3 organizer lifecycle", () => {
  test("organizer lands in the command center and cannot enter platform admin", async ({ page }) => {
    await loginAsOrganizer(page, "id");
    await expect(page).toHaveURL(/\/id\/organizer$/);
    await expect(page.getByRole("heading", { name: "Organizer Command Center" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create event" }).first()).toBeVisible();
    await expect(page.locator('aside a[href="/id/admin"]')).toHaveCount(0);
    await page.goto("/id/admin");
    await expect(page).toHaveURL(/\/id\/organizer$/);
  });
  test("organizer can create, autosave, preview, revoke, and publish an event", async ({ browser, page }) => {
    test.setTimeout(90_000);
    const event = eventIdentity();

    await loginAsOrganizer(page);
    await page.goto("/id/organizer/events/new");
    await page.getByLabel("Event name").fill(event.name);
    await page.getByLabel("Public URL slug").fill(event.slug);
    await page.getByRole("button", { name: "Create private draft" }).click();
    await expect(page).toHaveURL(/\/id\/organizer\/events\/[^/]+\/overview$/, { timeout: 30_000 });

    await page.getByRole("link", { name: "Tinjau & Terbitkan" }).click();
    await expect(page.getByRole("heading", { name: "Complete before publishing" })).toBeVisible();
    const description = "A complete browser-tested tournament draft for the Miracle V3 organizer lifecycle.";
    await page.getByRole("link", { name: "Identitas" }).click();
    await page.getByLabel("Deskripsi singkat").fill(description);
    await page.getByRole("link", { name: "Format & Jadwal" }).click();
    await page.getByLabel("Event dimulai").fill("2026-10-10T10:00");
    await page.getByLabel("Pelaksanaan").fill("Miracle Test Arena");
    await page.getByRole("link", { name: "Registrasi" }).click();
    await page.getByLabel("Pendaftaran dibuka").fill("2026-10-01T09:00");
    await page.getByLabel("Pendaftaran ditutup").fill("2026-10-07T21:00");
    await expect(page.getByRole("status").filter({ hasText: /Tersimpan|Saved/ })).toBeVisible({ timeout: 20_000 });

    await page.getByRole("link", { name: "Tinjau & Terbitkan" }).click();
    await expect(page.getByRole("heading", { name: "Ready to publish" })).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await page.getByRole("link", { name: "Identitas" }).click();
    await expect(page.getByLabel("Deskripsi singkat")).toHaveValue(description);
    await page.getByRole("link", { name: "Format & Jadwal" }).click();
    await expect(page.getByLabel("Pelaksanaan")).toHaveValue("Miracle Test Arena");
    await page.getByRole("link", { name: "Tinjau & Terbitkan" }).click();
    const review = page.locator("section#section-review");

    await review.getByRole("button", { name: "Create preview" }).click();
    const previewLink = review.getByRole("link", { name: "Open preview" });
    await expect(previewLink).toBeVisible({ timeout: 20_000 });
    const previewUrl = await previewLink.getAttribute("href");
    expect(previewUrl).toMatch(/^\/id\/preview\/events\//);

    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(previewUrl!);
    await expect(guestPage.getByLabel(/pratinjau privat|private preview/i)).toBeVisible();
    await expect(guestPage.getByText(event.name)).toBeVisible();

    await review.getByRole("button", { name: "Revoke link" }).click();
    await expect(review.getByRole("button", { name: "Create preview" })).toBeVisible({ timeout: 20_000 });
    await guestPage.goto(previewUrl!);
    await expect(guestPage.getByRole("heading", { name: /not found|halaman tidak ditemukan/i })).toBeVisible();
    await guest.close();

    await review.getByRole("button", { name: "Publish event" }).click();
    await expect(page.getByText("Event sudah diterbitkan")).toBeVisible({ timeout: 20_000 });
    await page.goto(`/id/events/${event.slug}`);
    await expect(page.getByRole("heading", { name: event.name })).toBeVisible({ timeout: 20_000 });
  });

  test("workspace stays within a 360px viewport", async ({ page }) => {
    const event = eventIdentity();
    await page.setViewportSize({ width: 360, height: 800 });
    await loginAsOrganizer(page);
    await page.goto("/id/organizer/events/new");
    await page.getByLabel("Event name").fill(event.name);
    await page.getByLabel("Public URL slug").fill(event.slug);
    await page.getByRole("button", { name: "Create private draft" }).click();
    await expect(page).toHaveURL(/\/id\/organizer\/events\/[^/]+\/overview$/, { timeout: 30_000 });
    const overflow = await page.locator("*").evaluateAll((elements) => elements
      .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        right: Math.round(element.getBoundingClientRect().right),
        text: element.textContent?.trim().slice(0, 80),
      }))
      .slice(0, 12));
    expect(overflow).toEqual([]);
  });
});