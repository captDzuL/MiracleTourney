import { expect, type Page } from "@playwright/test";

export async function loginWithCredentials(
  page: Page,
  {
    locale = "id",
    email,
    password,
    destination,
  }: {
    locale?: "id" | "en";
    email: string;
    password: string;
    destination: RegExp;
  },
) {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /masuk|sign in/i }).click();
  await expect(page).toHaveURL(destination);
}

export async function loginAsAdmin(page: Page, locale: "id" | "en" = "id") {
  await loginWithCredentials(page, {
    locale,
    email: "admin@miraclefc.gg",
    password: "Miracle2026!",
    destination: /\/(id|en)\/admin/,
  });
}

export async function loginAsCaptain(page: Page, locale: "id" | "en" = "id") {
  await loginWithCredentials(page, {
    locale,
    email: "captain@miraclefc.gg",
    password: "Miracle2026!",
    destination: /\/(id|en)\/captain/,
  });
}
