import { expect, type Page } from "@playwright/test";

let loginClientSequence = 0;

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
  // Each browser login represents a separate client. A unique RFC 2544 test-net
  // address keeps this suite from intentionally triggering the production per-IP
  // brute-force limit while preserving that middleware protection in every environment.
  loginClientSequence += 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.18.0.${(loginClientSequence % 250) + 1}` });
  await page.goto(`/${locale}/login`, { waitUntil: "domcontentloaded", timeout: 10_000 });
  const emailField = page.getByLabel(/email/i);
  const passwordField = page.getByLabel(/password/i);
  const submit = page.getByRole("button", { name: /masuk|sign in/i });
  await expect(emailField).toBeVisible({ timeout: 6_000 });
  await emailField.fill(email);
  await passwordField.fill(password);
  await submit.click({ timeout: 5_000 });
  await expect(page).toHaveURL(destination, { timeout: 10_000 });
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

export async function loginAsOrganizer(page: Page, locale: "id" | "en" = "id") {
  await loginWithCredentials(page, {
    locale,
    email: "organizer-a@miraclefc.gg",
    password: "Miracle2026!",
    destination: /\/(id|en)\/organizer/,
  });
}