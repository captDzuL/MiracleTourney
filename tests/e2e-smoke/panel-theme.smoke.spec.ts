import { expect, test, type Page } from "@playwright/test";

/**
 * Panel dark mode smoke — no database required.
 *
 * `/id/organizer` is the only operator surface middleware does not gate behind
 * a JWT role, so it is the one panel route reachable in a database-free run.
 * `/admin` and `/captain` share the exact same `PanelShell` wrapper and the
 * same CSS scope, so what holds here holds for them structurally.
 */

const PANEL_ROUTE = "/id/organizer";
const PUBLIC_ROUTE = "/id";
const STORAGE_KEY = "mt-panel-theme";

type Rgb = [number, number, number];

function srgbChannel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

async function setStoredMode(page: Page, mode: "light" | "dark" | "system") {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [STORAGE_KEY, mode] as const,
  );
}

test("panel route exposes the theme scope and toggle", async ({ page }) => {
  await page.goto(PANEL_ROUTE);

  await expect(page.locator(".panel-scope")).toHaveCount(1);
  await expect(page.getByRole("group", { name: /tema panel/i })).toBeVisible();
});

test("choosing dark repaints the panel and survives a reload", async ({ page }) => {
  await page.goto(PANEL_ROUTE);

  // Tailwind 4 emits oklch() and Chromium serialises computed styles in the
  // authored colour space, so the colour is resolved by painting it rather
  // than by parsing the string.
  const readRoot = () =>
    page.locator(".app-root").evaluate((el) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000000";
      ctx.fillStyle = getComputedStyle(el).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { rgb: [d[0], d[1], d[2]] as [number, number, number], alpha: d[3] };
    });

  const light = await readRoot();

  await page.getByRole("button", { name: "Gelap", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-panel-theme", "dark");

  const dark = await readRoot();

  expect(dark.rgb).not.toEqual(light.rgb);
  // A fully transparent background would otherwise read as pure black and sail
  // through the luminance assertion below.
  expect(dark.alpha).toBeGreaterThan(0);
  expect(relativeLuminance(dark.rgb)).toBeLessThan(0.05);

  // The preference must be applied by the pre-paint script, not after hydration.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-panel-theme", "dark");
});

test("every visible label in the dark panel clears 4.5:1", async ({ page }) => {
  await setStoredMode(page, "dark");
  await page.goto(PANEL_ROUTE);
  await expect(page.locator(".panel-scope")).toBeVisible();

  const samples = await page.locator(".panel-scope").evaluate((scope) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    function paint(color: string) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000000";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { rgb: [d[0], d[1], d[2]] as [number, number, number], alpha: d[3] };
    }

    function effectiveBackground(start: Element): [number, number, number] | null {
      let node: Element | null = start;
      while (node) {
        const style = getComputedStyle(node);
        if (style.backgroundImage && style.backgroundImage !== "none") return null;
        const painted = paint(style.backgroundColor);
        if (painted.alpha > 0) return painted.rgb;
        node = node.parentElement;
      }
      return null;
    }

    const results: Array<{
      text: string;
      color: [number, number, number];
      background: [number, number, number];
      size: number;
    }> = [];

    for (const el of Array.from(scope.querySelectorAll<HTMLElement>("*"))) {
      const ownText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim() ?? "")
        .join(" ")
        .trim();
      if (!ownText) continue;

      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;
      if (!el.getClientRects().length) continue;

      const background = effectiveBackground(el);
      if (!background) continue;

      results.push({
        text: ownText.slice(0, 60),
        color: paint(style.color).rgb,
        background,
        size: Number.parseFloat(style.fontSize),
      });
    }

    return results;
  });

  expect(samples.length).toBeGreaterThan(5);

  const failures = samples
    .map((sample) => ({ ...sample, ratio: contrastRatio(sample.color, sample.background) }))
    // WCAG large-text allowance: 18.66px bold or 24px regular.
    .filter((sample) => sample.ratio < (sample.size >= 24 ? 3 : 4.5));

  expect(
    failures.map(
      (f) =>
        `${f.ratio.toFixed(2)}:1  "${f.text}"  rgb(${f.color.join(",")}) on rgb(${f.background.join(",")})`,
    ),
  ).toEqual([]);
});

test("system mode follows the operating system preference", async ({ page }) => {
  await setStoredMode(page, "system");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(PANEL_ROUTE);
  await expect(page.locator("html")).toHaveAttribute("data-panel-theme", "dark");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-panel-theme", "light");
});

test("public pages are untouched by the panel theme", async ({ page }) => {
  await setStoredMode(page, "dark");
  await page.goto(PUBLIC_ROUTE);

  // The attribute is global by design; the styling is not.
  await expect(page.locator("html")).toHaveAttribute("data-panel-theme", "dark");
  await expect(page.locator(".panel-scope")).toHaveCount(0);

  const themedNodes = await page.locator(".app-root:has(.panel-scope)").count();
  expect(themedNodes).toBe(0);
});
