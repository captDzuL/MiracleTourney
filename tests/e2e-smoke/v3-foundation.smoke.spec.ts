import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const shellCases = [
  { name: "public", path: "/id", role: null, expectedHref: "/id/events" },
  { name: "organizer", path: "/id/organizer", role: "organizer", expectedHref: "/id/admin" },
  { name: "captain", path: "/id/organizer", role: "captain", expectedHref: "/id/captain" },
  { name: "admin", path: "/id/organizer", role: "platform_admin", expectedHref: "/id/admin" },
] as const;

async function mockSession(page: Page, role: (typeof shellCases)[number]["role"]) {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        user: role
          ? { name: `${role} smoke user`, role, pendingCount: role === "platform_admin" ? 2 : 0 }
          : null,
      }),
    });
  });
}

async function expectVisibleFocus(locator: ReturnType<Page["locator"]>) {
  await expect(locator).toBeFocused();
  const focusStyle = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { focusVisible: element.matches(":focus-visible"), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.focusVisible).toBe(true);
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(1);
}
async function tabToHref(page: Page, href: string) {
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    if ((await focused.getAttribute("href")) === href) return focused;
  }
  throw new Error(`Keyboard could not reach ${href}`);
}
async function assertFoundation(page: Page, width: number) {
  await expect(page.locator(".app-root.miracle-v3")).toBeVisible();
  await expect(page.locator('header img[src="/logo/miracle-horizontal.svg"]')).toBeVisible();
  await expect(page.getByText("Copyright © Miracle", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-panel-theme", "dark");

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(overflow.clientWidth);

  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Lewati ke konten" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await expectVisibleFocus(skipLink);

  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
}

for (const viewport of viewports) {
  for (const shell of shellCases) {
    test(`${shell.name} shell meets the V3 foundation at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await mockSession(page, shell.role);
      await page.goto(shell.path);

      await assertFoundation(page, viewport.width);

      const operator = shell.name !== "public";
      const mobileNavigation = operator ? viewport.width < 980 : viewport.width < 620;
      if (mobileNavigation) {
        const trigger = page.getByRole("button", { name: "Buka navigasi" });
        await expect(trigger).toBeVisible();
        await trigger.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.locator(`a[href="${shell.expectedHref}"]`)).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(trigger).toBeFocused();

        await page.keyboard.press("Enter");
        const reopenedDialog = page.getByRole("dialog");
        await page.keyboard.press("Tab");
        const firstNavigationLink = reopenedDialog.locator('a[href="/id/events"]');
        await expectVisibleFocus(firstNavigationLink);
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/\/id\/events$/);
      } else {
        await expect(page.locator(`a[href="${shell.expectedHref}"]`).last()).toBeVisible();
        const keyboardLink = await tabToHref(page, "/id/events");
        await expectVisibleFocus(keyboardLink);
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/\/id\/events$/);
      }
    });
  }
}

test("V3 locale buttons are keyboard reachable with visible focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockSession(page, null);
  await page.goto("/id");

  let focused = page.locator(":focus");
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    focused = page.locator(":focus");
    if ((await focused.textContent())?.trim() === "id") break;
  }
  expect((await focused.textContent())?.trim()).toBe("id");
  await expectVisibleFocus(focused);

  await page.keyboard.press("Tab");
  const english = page.locator(":focus");
  expect((await english.textContent())?.trim()).toBe("en");
  await expectVisibleFocus(english);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/en$/);
});
