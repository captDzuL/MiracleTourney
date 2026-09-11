import { expect, test } from "@playwright/test";

import { loginAsAdmin, loginAsOrganizer } from "./helpers/auth";

test.describe.serial("Published Event Revision V3", () => {
  test("organizer stages, previews, and applies a Published event revision", async ({ browser, page }) => {
    test.setTimeout(90_000);
    await loginAsOrganizer(page);
    await page.goto("/id/organizer");
    const card = page.locator("article").filter({ hasText: "Flashpeak Revision Published" }).last();
    const editLink = card.getByRole("link", { name: /Edit event|Lanjutkan revisi/ });
    const editHref = await editLink.getAttribute("href");
    expect(editHref).toMatch(/^\/id\/organizer\/events\/[^/]+\/edit$/);
    await Promise.all([
      page.waitForURL(/\/id\/organizer\/events\/[^/]+\/edit/, { timeout: 30_000 }),
      editLink.click(),
    ]);

    const updatedDescription = "Deskripsi revisi privat yang baru terlihat setelah Perbarui event publik.";
    await page.getByLabel("Deskripsi singkat").fill(updatedDescription);
    await expect(page.getByRole("status").filter({ hasText: "Tersimpan" })).toBeVisible({ timeout: 20_000 });

    const guest = await browser.newContext();
    const publicPage = await guest.newPage();
    await publicPage.goto("/id/events/flashpeak-revision-published");
    const publicContent = publicPage.getByRole("main");
    await expect(publicContent.getByText("Original public description for revision E2E.").first()).toBeVisible();
    await expect(publicContent.getByText(updatedDescription)).toHaveCount(0);

    await page.getByRole("link", { name: "Tinjau & Terbitkan" }).click();
    await page.getByRole("button", { name: "Buat preview privat" }).click();
    const previewLink = page.getByRole("link", { name: "Buka preview" });
    await expect(previewLink).toBeVisible({ timeout: 20_000 });
    const previewUrl = await previewLink.getAttribute("href");
    expect(previewUrl).toMatch(/^\/id\/preview\/events\//);
    const previewPage = await guest.newPage();
    await previewPage.goto(previewUrl!);
    await expect(previewPage.getByText(updatedDescription)).toBeVisible();

    await page.getByRole("button", { name: "Perbarui event publik" }).click();
    await expect(page).toHaveURL(/\/id\/organizer\/events\/[^/]+\/overview/, { timeout: 20_000 });
    await publicPage.reload();
    await expect(publicContent.getByText(updatedDescription).first()).toBeVisible({ timeout: 20_000 });
    await previewPage.goto(previewUrl!);
    await expect(previewPage.getByRole("heading", { name: /not found|halaman tidak ditemukan/i })).toBeVisible();
    await guest.close();
  });

  test("Registration Closed locks registration fields while public fields remain editable", async ({ page }) => {
    await loginAsOrganizer(page);
    await page.goto("/id/organizer");
    const card = page.locator("article").filter({ hasText: "Flashpeak Registration Closed" }).last();
    await card.getByRole("link", { name: "Edit event" }).click();
    await page.getByRole("navigation", { name: "Navigasi event" }).getByRole("link", { name: "Registrasi" }).click();
    await expect(page.getByLabel("Pendaftaran dibuka")).toBeDisabled();
    await expect(page.getByLabel("Pendaftaran ditutup")).toBeDisabled();
    await expect(page.getByLabel("Pendaftaran berbayar")).toBeDisabled();
    await expect(page.getByText(/Pendaftaran sudah ditutup/).first()).toBeVisible();
    await page.getByRole("link", { name: "Halaman Publik" }).click();
    await expect(page.getByLabel("Informasi hadiah")).toBeEnabled();
  });

  test("Ongoing and Finished routes are fully locked", async ({ page }) => {
    await loginAsOrganizer(page);
    await page.goto("/id/organizer");
    for (const name of ["Flashpeak Rising 64", "Flashpeak Champions 32"]) {
      await page.goto("/id/organizer");
      const card = page.locator("article").filter({ hasText: name }).last();
      const workspaceHref = await card.getByRole("link", { name: "Buka workspace" }).getAttribute("href");
      const eventId = workspaceHref!.split("/").at(-2);
      await page.goto(`/id/organizer/events/${eventId}/edit`);
      await expect(page.getByRole("heading", { name: "Informasi event tidak dapat diedit." })).toBeVisible();
    }
  });

  test("Platform Admin changes a slug and the old URL redirects permanently", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/id/admin");
    const row = page.locator("tr").filter({ hasText: "Flashpeak Revision Published" }).last();
    await row.getByRole("link", { name: /Edit event|Lanjutkan revisi/ }).click();
    const slug = `flashpeak-revision-${Date.now()}`;
    const input = page.getByLabel("URL publik khusus Platform Admin");
    await input.fill(slug);
    const mutationResponse = page.waitForResponse((response) =>
      response.request().method() === "POST" && response.url().includes("/id/admin/events/"),
    );
    await page.getByRole("button", { name: "Ganti URL dan buat redirect" }).click();
    await expect((await mutationResponse).status()).toBeLessThan(400);
    await page.goto("/id/events/flashpeak-revision-published");
    await expect(page).toHaveURL(new RegExp(`/id/events/${slug}$`), { timeout: 30_000 });
  });

  test("revision editor has no horizontal overflow at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await loginAsOrganizer(page);
    await page.goto("/id/organizer");
    const card = page.locator("article").filter({ hasText: "Flashpeak Registration Closed" }).last();
    await card.getByRole("link", { name: /Edit event|Lanjutkan revisi/ }).click();
    const overflow = await page.locator("*").evaluateAll((elements) => elements
      .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .map((element) => element.tagName)
      .slice(0, 12));
    expect(overflow).toEqual([]);
  });
});
