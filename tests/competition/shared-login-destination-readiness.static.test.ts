import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const auth = readFileSync(resolve(root, "tests/e2e/helpers/auth.ts"), "utf8");
const captainAuth = readFileSync(resolve(root, "tests/e2e/captain-auth.spec.ts"), "utf8");

const loginBody = auth.match(
  /export async function loginWithCredentials[\s\S]*?export async function loginAsAdmin/,
)?.[0] ?? "";

describe("shared login destination readiness contract", () => {
  it("settles the authenticated destination at DOMContentLoaded", () => {
    expect(loginBody).toMatch(
      /await page\.waitForURL\(destination,\s*\{\s*waitUntil: "domcontentloaded",\s*timeout: 60_000,\s*\}\);/,
    );
  });

  it("keeps shared login sequencing and rate-limit isolation unchanged", () => {
    expect(loginBody).toContain('"x-forwarded-for": `198.18.0.${(loginClientSequence % 250) + 1}`');
    expect(loginBody).toContain('"x-e2e-clock": "2026-09-21T00:00:00.000Z"');

    const orderedSteps = [
      "normalizeReleasePage(page)",
      "page.setExtraHTTPHeaders",
      "page.goto(`/${locale}/login`",
      "probeReleaseReducedMotion(page)",
      "installReleaseClock(page)",
      "await emailField.fill(email)",
      "await passwordField.fill(password)",
      "await submit.click({ timeout: 20_000 })",
      "await page.waitForURL(destination",
    ];

    for (const [current, next] of orderedSteps.slice(0, -1).map((step, index) => [step, orderedSteps[index + 1]] as const)) {
      expect(loginBody.indexOf(current), `${current} must be present`).toBeGreaterThanOrEqual(0);
      expect(loginBody.indexOf(next), `${next} must be present`).toBeGreaterThan(loginBody.indexOf(current));
    }

    expect(loginBody).not.toMatch(/route\s*\(|unroute\s*\(|resourceType|page\.route/);
  });

  it("preserves role credentials, destination regexes, and caller-owned readiness", () => {
    expect(auth).toContain('email: "admin@miraclefc.gg"');
    expect(auth).toContain('password: "Miracle2026!"');
    expect(auth).toContain('destination: /\\/(id|en)\\/admin/');

    expect(auth).toContain('email: "captain@miraclefc.gg"');
    expect(auth).toContain('password: "Miracle2026!"');
    expect(auth).toContain('destination: /\\/(id|en)\\/captain/');

    expect(auth).toContain('email: "organizer-a@miraclefc.gg"');
    expect(auth).toContain('password: "Miracle2026!"');
    expect(auth).toContain('destination: /\\/(id|en)\\/organizer/');

    expect(loginBody).not.toMatch(/getByRole\("(main|heading)"/);
    expect(captainAuth).toContain('await expect(page.getByRole("main")).toBeVisible();');
    expect(captainAuth.indexOf('await loginAsCaptain(page, "id");')).toBeLessThan(
      captainAuth.indexOf('await expect(page.getByRole("main")).toBeVisible();'),
    );
  });
});
