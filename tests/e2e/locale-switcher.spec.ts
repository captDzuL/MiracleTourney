import { expect, test } from "@playwright/test";

const cases = [
  { path: "/id", lang: "id", home: "Beranda", signIn: "Masuk" },
  { path: "/en", lang: "en", home: "Home", signIn: "Sign in" },
] as const;

for (const item of cases) {
  test(`renders the V3 ${item.lang} shell`, async ({ page }) => {
    await page.goto(item.path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", item.lang);
    await expect(page.getByRole("link", { name: item.home, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: item.signIn, exact: true })).toBeVisible();
    await expect(page.locator("header")).toHaveCount(1);
    const display = await page.locator("header").evaluate((node) => getComputedStyle(node).display);
    expect(display).toBe("flex");
    await expect(page.getByLabel(/pilih bahasa|select language/i)).toHaveCount(0);
  });
}
