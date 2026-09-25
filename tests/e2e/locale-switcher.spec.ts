import { expect, test } from "@playwright/test";

const cases = [
  { path: "/id", lang: "id", home: "Beranda", signIn: "Masuk" },
  { path: "/en", lang: "en", home: "Home", signIn: "Sign in" },
] as const;

const viewports = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
] as const;

for (const viewport of viewports) {
  test.describe(`${viewport.name} V3 shell`, () => {
    test.use({ viewport: viewport.viewport });

    for (const item of cases) {
      test(`renders the V3 ${item.lang} shell`, async ({ page }) => {
        await page.goto(item.path, { waitUntil: "domcontentloaded" });
        await expect(page.locator("html")).toHaveAttribute("lang", item.lang);
        const header = page.locator("header");
        const brandLink = header.locator("a.mpv3-brand");
        await expect(brandLink).toHaveAccessibleName(item.home);
        await expect(brandLink).toBeVisible();
        await expect(brandLink).toHaveAttribute("aria-current", "page");
        await expect(header.getByRole("link", { name: item.signIn, exact: true })).toBeVisible();
        await expect(header).toHaveCount(1);
        const display = await header.evaluate((node) => getComputedStyle(node).display);
        expect(display).toBe("flex");
        await expect(page.getByLabel(/pilih bahasa|select language/i)).toHaveCount(0);
      });
    }
  });
}
