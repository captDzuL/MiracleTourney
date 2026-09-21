import { expect, test, type Page } from "@playwright/test";

import { loginAsOrganizer, loginWithCredentials } from "./helpers/auth";
import { prepareOrganizerReleaseFixture } from "./helpers/fixtures";

export const VIEWPORTS = [
  { name: "360", width: 360, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 900 },
  { name: "1024", width: 1024, height: 900 },
  { name: "1440", width: 1440, height: 900 },
] as const;

export const LOCALES = ["id", "en"] as const;
export const FEATURE_FLAG_MODES = ["on", "off"] as const;
const VALID_ARIA_SORT_VALUES = new Set(["ascending", "descending", "none", "other"]);

/**
 * Shared release contract: keep the assertions in one place so every locale and
 * viewport exercises the same keyboard, focus, control-size, and overflow rules.
 */
export async function expectReleaseAccessibilityContract(page: Page) {
  const contract = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const visible = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const controls = Array.from(document.querySelectorAll<HTMLElement>(
      'main button, main a[href], main input, main select, main textarea, main summary',
    )).filter(visible);
    const focusables = controls.filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0);
    const boxes = focusables.map((element) => {
      const box = element.getBoundingClientRect();
      return { top: Math.round(box.top), left: Math.round(box.left), tag: element.tagName };
    });
    const sorted = [...boxes].sort((left, right) => left.top - right.top || left.left - right.left);
    const ariaSort = Array.from(document.querySelectorAll<HTMLElement>("[aria-sort]"), (element) => element.getAttribute("aria-sort"));
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const activeBox = active?.getBoundingClientRect();
    const activeFocus = active ? {
      focusVisible: active.matches(":focus-visible"),
      visible: visible(active),
      inViewport: Boolean(activeBox && activeBox.bottom > 0 && activeBox.right > 0 && activeBox.top < viewport.height && activeBox.left < viewport.width),
      unobscured: Boolean(activeBox && (() => {
        const x = Math.max(activeBox.left + 1, Math.min(activeBox.right - 1, viewport.width / 2));
        const y = Math.max(activeBox.top + 1, Math.min(activeBox.bottom - 1, viewport.height / 2));
        const hit = document.elementFromPoint(x, y);
        return hit === active || Boolean(hit && active.contains(hit));
      })()),
    } : null;
    const undersizedControls = controls
      .map((element) => ({ element: element.tagName, label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || element.tagName, height: element.getBoundingClientRect().height }))
      .filter(({ height }) => height < 44);
    return {
      viewport,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      focusOrderMatchesVisualOrder: boxes.every((box, index) => box.top === sorted[index]?.top && box.left === sorted[index]?.left),
      ariaSort,
      activeFocus,
      undersizedControls,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      runningAnimations: document.getAnimations().filter((animation) => animation.playState === "running").length,
    };
  });

  expect(contract.overflow, `horizontal overflow at ${contract.viewport.width}px`).toBe(false);
  expect(contract.focusOrderMatchesVisualOrder, "keyboard tab order must follow visual order").toBe(true);
  expect(contract.ariaSort.every((value) => value !== null && VALID_ARIA_SORT_VALUES.has(value)), "aria-sort values must be valid").toBe(true);
  expect(contract.undersizedControls, `controls below 44px at ${contract.viewport.width}px`).toEqual([]);
  expect(contract.reducedMotion).toBe(true);
  expect(contract.runningAnimations, "reduced-motion mode must not leave animations running").toBe(0);
  if (contract.activeFocus) {
    expect(contract.activeFocus.focusVisible, "keyboard focus must be visibly indicated").toBe(true);
    expect(contract.activeFocus.visible, "focused control must remain visible").toBe(true);
    expect(contract.activeFocus.inViewport, "focused control must remain in the viewport").toBe(true);
    expect(contract.activeFocus.unobscured, "focused control must not be obscured by sticky UI").toBe(true);
  }
}

export async function expectNavigationEscapeRestoresFocus(page: Page) {
  const trigger = page.getByRole("button", { name: /open navigation|buka navigasi/i });
  if (!(await trigger.isVisible().catch(() => false))) return;
  await trigger.focus();
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

type ReleaseFixture = Awaited<ReturnType<typeof prepareOrganizerReleaseFixture>>;

async function expectLocalizedRegistrationSurface(page: Page, fixture: ReleaseFixture, locale: (typeof LOCALES)[number], view: "queue" | "import" | "payments" | "qris") {
  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/registration?view=${view}`);
  await expect(page.locator(`[data-view="${view}"]`)).toHaveAttribute("aria-current", "page");
  await expect(page.locator("main")).toBeVisible();
  if (view === "import") {
    await expect(page.locator('input[type="file"][accept*=".csv"]')).toBeVisible();
    await expect(page.locator("[data-preview]")).toBeVisible();
  }
  if (view === "payments") {
    await expect(page.getByRole("heading", { name: /payment queue|antrian pembayaran/i })).toBeVisible();
    await expect(page.locator("[data-approve], [data-reject]").first()).toBeVisible();
  }
  if (view === "qris") {
    await expect(page.getByRole("heading", { name: /QRIS/i })).toBeVisible();
    await expect(page.locator("[data-save]")).toBeVisible();
    await expect(page.locator("[data-publish]")).toBeVisible();
    await expect(page.locator('img[alt*="QRIS" i]')).toBeVisible();
  }
}

async function runOrganizerReleaseJourney(page: Page, fixture: ReleaseFixture, locale: (typeof LOCALES)[number], publishOnce: boolean) {
  await expectLocalizedRegistrationSurface(page, fixture, locale, "queue");
  await expectLocalizedRegistrationSurface(page, fixture, locale, "import");
  await expectLocalizedRegistrationSurface(page, fixture, locale, "payments");
  await expectLocalizedRegistrationSurface(page, fixture, locale, "qris");

  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/competition`);
  await expect(page.locator("[data-operations]")).toBeVisible();
  await expect(page.getByRole("heading", { name: /competition|kompetisi/i })).toBeVisible();
  await expectReleaseAccessibilityContract(page);

  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/schedule`);
  await expect(page.getByRole("heading", { name: /schedule generation|pembuatan jadwal/i })).toBeVisible();
  await expect(page.locator("[data-operations]")).toBeVisible();

  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/match-control`);
  await expect(page.getByRole("heading", { name: /match control|kontrol pertandingan/i })).toBeVisible();
  const matchId = fixture.graph.matches[0]?.id;
  expect(matchId, "release fixture must expose a deterministic match").toBeTruthy();
  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/matches/${encodeURIComponent(matchId!)}`);
  await expect(page.locator("[data-match-workspace]")).toBeVisible();
  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/matches/${encodeURIComponent(matchId!)}?view=statistics`);
  await expect(page.locator("[data-match-workspace]")).toBeVisible();
  await expect(page.getByRole("heading", { name: /statistics|statistik/i }).first()).toBeVisible();
  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/matches/${encodeURIComponent(matchId!)}?view=history`);
  await expect(page.getByRole("heading", { name: /history|riwayat/i }).first()).toBeVisible();

  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/completion`);
  await expect(page.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", "completed");
  await expectReleaseAccessibilityContract(page);

  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/certificates`);
  await expect(page.locator('[data-certificate-type]')).toHaveCount(7);
  await expect(page.locator('[data-hydration-ready="true"]')).toHaveCount(1);
  const revision = page.locator("[data-certificate-publication-revision], [data-publication-revision]").first();
  await expect(revision).toHaveText(/\d+/);
  if (publishOnce) {
    const publish = page.locator("[data-publish-certificate-set]");
    if (await publish.isEnabled()) {
      await publish.click();
      await expect(page.getByRole("status")).toContainText(/published|diterbitkan/i);
    }
  }
  await page.goto(`/id/certificates/verify/${encodeURIComponent(fixture.historicalVerificationCode!)}`);
  await expect(page.locator('[data-certificate-verification="superseded"]')).toBeVisible();
  await page.goto(`/${locale}/certificates/verify/${encodeURIComponent(fixture.currentVerificationCode!)}`);
  await expect(page.locator('[data-certificate-verification="current"]')).toBeVisible();
  await expectNavigationEscapeRestoresFocus(page);
  const artifactText = await page.locator("body").innerText();
  expect(artifactText).not.toMatch(/Miracle2026!|organizer-a@miraclefc\.gg|captain@miraclefc\.gg/i);
}

function eventIdentity() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: `V3 Lifecycle ${suffix}`,
    slug: `v3-lifecycle-${suffix}`,
  };
}

test.describe.configure({ mode: "serial" });

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`organizer release accessibility matrix ${locale} ${viewport.name}px`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginWithCredentials(page, {
        locale,
        email: "organizer-a@miraclefc.gg",
        password: "Miracle2026!",
        destination: /organizer/,
      });
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expectReleaseAccessibilityContract(page);
      await expectNavigationEscapeRestoresFocus(page);
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).not.toMatch(/Miracle2026!|organizer-a@miraclefc\.gg/i);
      await page.screenshot({
        path: test.info().outputPath(`release-accessibility-${locale}-${viewport.name}.png`),
        animations: "disabled",
      });
    });
  }
}

test("organizer release journey covers registration through publication in ID and EN", async ({ page }) => {
  test.setTimeout(180_000);
  const fixture = await prepareOrganizerReleaseFixture("release-journey");
  try {
    for (const [index, locale] of LOCALES.entries()) {
      await loginWithCredentials(page, {
        locale,
        email: "organizer-a@miraclefc.gg",
        password: "Miracle2026!",
        destination: /organizer/,
      });
      await runOrganizerReleaseJourney(page, fixture, locale, index === 0);
    }
  } finally {
    await fixture.cleanup();
  }
});

test("admin can use the shared workspace while a non-owner is denied", async ({ browser }) => {
  test.setTimeout(120_000);
  const fixture = await prepareOrganizerReleaseFixture("release-roles");
  const adminPage = await browser.newPage();
  const nonOwnerPage = await browser.newPage();
  try {
    await loginWithCredentials(adminPage, {
      locale: "en",
      email: "admin@miraclefc.gg",
      password: "Miracle2026!",
      destination: /admin|organizer/,
    });
    await adminPage.goto(`/en/organizer/events/${encodeURIComponent(fixture.id)}/registration?view=queue`);
    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage.locator('[data-view="queue"]')).toHaveAttribute("aria-current", "page");

    await loginWithCredentials(nonOwnerPage, {
      locale: "en",
      email: "organizer-b@miraclefc.gg",
      password: "Miracle2026!",
      destination: /organizer/,
    });
    const response = await nonOwnerPage.goto(`/en/organizer/events/${encodeURIComponent(fixture.id)}/registration?view=queue`);
    expect(response?.status() ?? 404).toBeGreaterThanOrEqual(400);
    await expect(nonOwnerPage.getByText(fixture.eventName, { exact: true })).toHaveCount(0);
    await expect(nonOwnerPage.locator("body")).not.toContainText(fixture.id);
  } finally {
    await adminPage.close();
    await nonOwnerPage.close();
    await fixture.cleanup();
  }
});

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

  for (const locale of ["id", "en"] as const) {
    test(`workspace navigation labels fit without overlap at ${locale} tablet widths`, async ({ page }) => {
      test.setTimeout(90_000);
      const event = eventIdentity();
      await loginAsOrganizer(page, locale);
      await page.goto(`/${locale}/organizer/events/new`);
      await page.getByLabel("Event name").fill(event.name);
      await page.getByLabel("Public URL slug").fill(event.slug);
      await page.getByRole("button", { name: "Create private draft" }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/organizer/events/[^/]+/overview$`), { timeout: 30_000 });

      for (const width of [700, 768, 980]) {
        await page.setViewportSize({ width, height: 800 });
        const layout = await page.locator('nav:has(a[aria-current="step"])').evaluate((navigation) => {
          const viewportWidth = document.documentElement.clientWidth;
          const labels = Array.from(navigation.querySelectorAll<HTMLElement>("a > span:last-child"))
            .map((label) => {
              const rect = label.getBoundingClientRect();
              return { left: Math.round(rect.left), right: Math.round(rect.right), visible: rect.width > 1 && rect.height > 1 };
            });
          return {
            overflow: Array.from(document.querySelectorAll<HTMLElement>("*")).filter((element) => element.getBoundingClientRect().right > viewportWidth + 1).map((element) => element.tagName),
            labels,
            overlaps: labels.flatMap((label, index) => labels.slice(index + 1).filter((other) => label.right > other.left + 1).map(() => index)),
          };
        });
        expect(layout.overflow).toEqual([]);
        expect(layout.labels).toHaveLength(5);
        expect(layout.labels.filter((label) => label.visible)).toHaveLength(width < 900 ? 0 : 5);
        expect(layout.overlaps).toEqual([]);
      }
    });
  }
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
