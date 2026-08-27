import { expect, test, type Page } from "@playwright/test";

/**
 * Release gate for the public visual v2 redesign.
 *
 * Enforces the byte budgets, eager-image rule, geometry, keyboard focus,
 * reduced motion, and image-failure fallback recorded in `snapshot.md`.
 *
 * The smoke environment runs without a database, so events resolve through the
 * demo store and may legitimately render the deterministic typographic poster
 * instead of real artwork. Every budget assertion therefore reports which path
 * it measured so a regression is actionable instead of silently vacuous.
 */

const KIB = 1024;
const HERO_DESKTOP_BUDGET_BYTES = 300 * KIB;
const HERO_MOBILE_BUDGET_BYTES = 200 * KIB;
const TILE_BUDGET_BYTES = 120 * KIB;

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

type ArtworkSlot = {
  index: number;
  source: string | null;
  src: string | null;
  fetchPriority: string | null;
  loading: string | null;
};

/**
 * The v2 shell adds `.public-visual-v2` to the page root. When the flag is off
 * the legacy rendering is returned untouched and none of these budgets apply.
 */
async function skipUnlessVisualV2(page: Page) {
  const enabled = (await page.locator(".public-visual-v2").count()) > 0;
  test.skip(!enabled, "public_visual_v2 is disabled - legacy rendering is out of scope for this gate");
}

/** Records the transferred byte length of every successful `/_next/image` response. */
function collectOptimizedImageBytes(page: Page) {
  const bytesByUrl = new Map<string, number>();
  const inFlight: Array<Promise<void>> = [];

  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/_next/image") || !response.ok()) return;

    inFlight.push(
      response
        .body()
        .then((body) => {
          bytesByUrl.set(url, body.length);
        })
        .catch(() => {
          // A response body can be discarded on navigation; an unreadable body
          // cannot be judged against a budget, so it is simply not recorded.
        }),
    );
  });

  return {
    bytesByUrl,
    async settle() {
      // Bodies resolve asynchronously and can enqueue while awaiting, so drain twice.
      await Promise.all([...inFlight]);
      await Promise.all([...inFlight]);
    },
  };
}

async function readArtworkSlots(page: Page): Promise<ArtworkSlot[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-event-art-source]")).map((wrapper, index) => {
      const image = wrapper.querySelector("img");
      return {
        index,
        source: wrapper.getAttribute("data-event-art-source"),
        src: image ? image.currentSrc || image.getAttribute("src") : null,
        fetchPriority: image ? image.getAttribute("fetchpriority") : null,
        loading: image ? image.getAttribute("loading") : null,
      };
    }),
  );
}

function bytesFor(bytesByUrl: Map<string, number>, src: string | null) {
  if (!src) return undefined;
  for (const [url, bytes] of bytesByUrl) {
    if (url === src || url.endsWith(src) || src.endsWith(new URL(url).pathname + new URL(url).search)) {
      return bytes;
    }
  }
  return undefined;
}

test.describe("public visual v2 release budgets", () => {
  test("homepage exposes one heading and at most one eager artwork", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/id");
    await skipUnlessVisualV2(page);

    const headings = page.locator("h1");
    await expect(headings).toHaveCount(1);
    await expect(headings.first()).toBeVisible();

    const slots = await readArtworkSlots(page);
    expect(slots.length, "homepage must render at least one event artwork slot").toBeGreaterThan(0);

    const eagerCount = await page.locator('img[fetchpriority="high"]').count();
    const withArtwork = slots.filter((slot) => Boolean(slot.src));

    if (withArtwork.length > 0) {
      expect(
        eagerCount,
        `exactly one priority image is allowed in the homepage initial viewport, found ${eagerCount}: ` +
          JSON.stringify(withArtwork.map((slot) => slot.src)),
      ).toBe(1);

      const belowTheFold = withArtwork.slice(1);
      for (const slot of belowTheFold) {
        expect(
          slot.fetchPriority,
          `event rail image ${slot.src} must not be eager (fetchpriority=${slot.fetchPriority})`,
        ).not.toBe("high");
      }
    } else {
      // No artwork URL resolved: the deterministic typographic poster is the
      // expected path, and it must cost zero eager image bytes.
      expect(
        eagerCount,
        "typographic fallback must not request any priority image",
      ).toBe(0);
      expect(
        slots.map((slot) => slot.source),
        "every artwork slot must declare the typographic fallback source",
      ).toEqual(slots.map(() => "typographic"));
      await expect(page.locator(".event-visual--typographic").first()).toBeVisible();
    }
  });

  test("hero CTA navigates to the featured event detail page", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/id");
    await skipUnlessVisualV2(page);

    const cta = page.getByTestId("pv-hero-primary-cta");
    await expect(cta).toBeVisible();

    const href = await cta.getAttribute("href");
    expect(href, "Explore Event CTA must link to an event detail route").toMatch(/\/events\/[^/]+$/);

    await cta.click();
    // The smoke server runs `next dev`, so the first hit on the detail route
    // pays a compile cost that has nothing to do with the release budgets.
    await expect(page).toHaveURL(new RegExp(`${href}$`), { timeout: 60_000 });
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toBeVisible();
  });

  for (const [label, viewport] of [
    ["desktop 1440x900", DESKTOP],
    ["mobile 390x844", MOBILE],
  ] as const) {
    test(`homepage has no horizontal overflow at ${label}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/id");
      await skipUnlessVisualV2(page);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(
        overflow.scrollWidth,
        `page scrolls horizontally: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
      ).toBeLessThanOrEqual(overflow.clientWidth);
    });
  }

  test("image byte budgets hold for the hero and every event tile", async ({ page }) => {
    const measured: string[] = [];

    for (const [label, viewport, heroBudget] of [
      ["desktop", DESKTOP, HERO_DESKTOP_BUDGET_BYTES],
      ["mobile", MOBILE, HERO_MOBILE_BUDGET_BYTES],
    ] as const) {
      const collector = collectOptimizedImageBytes(page);

      await page.setViewportSize(viewport);
      await page.goto("/id", { waitUntil: "networkidle" });
      await skipUnlessVisualV2(page);
      await collector.settle();

      const slots = await readArtworkSlots(page);
      const withArtwork = slots.filter((slot) => Boolean(slot.src));

      if (collector.bytesByUrl.size === 0) {
        // Meaningful negative assertion: no optimized image was served, so the
        // page must actually be on the typographic fallback path, not silently
        // shipping unmeasured bytes through some other delivery mechanism.
        expect(
          withArtwork,
          `no /_next/image response was observed on ${label}, but ${withArtwork.length} artwork slot(s) reference an image src`,
        ).toEqual([]);
        expect(
          slots.map((slot) => slot.source),
          `no /_next/image response on ${label}: every slot must be the typographic fallback`,
        ).toEqual(slots.map(() => "typographic"));
        await expect(page.locator(".event-visual__initials").first()).toBeVisible();
        measured.push(`${label}: 0 optimized image responses (typographic fallback, ${slots.length} slots)`);
        continue;
      }

      const heroSrc = withArtwork[0]?.src ?? null;
      const heroBytes = bytesFor(collector.bytesByUrl, heroSrc);

      if (heroBytes !== undefined) {
        expect(
          heroBytes,
          `${label} hero exceeds budget: ${heroSrc} = ${heroBytes} bytes (budget ${heroBudget} bytes)`,
        ).toBeLessThanOrEqual(heroBudget);
        measured.push(`${label} hero: ${heroBytes} bytes (${heroSrc})`);
      }

      for (const [url, bytes] of collector.bytesByUrl) {
        if (url === heroSrc) continue;
        expect(
          bytes,
          `event tile exceeds budget on ${label}: ${url} = ${bytes} bytes (budget ${TILE_BUDGET_BYTES} bytes)`,
        ).toBeLessThanOrEqual(TILE_BUDGET_BYTES);
      }

      const largestTile = [...collector.bytesByUrl.entries()]
        .filter(([url]) => url !== heroSrc)
        .sort((a, b) => b[1] - a[1])[0];
      measured.push(
        largestTile
          ? `${label} largest tile: ${largestTile[1]} bytes (${largestTile[0]})`
          : `${label}: no non-hero optimized image responses`,
      );
    }

    test.info().annotations.push({ type: "image-bytes", description: measured.join(" | ") });
  });

  test("decorative texture costs zero network bytes", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/id");
    await skipUnlessVisualV2(page);

    const textures = await page.evaluate(() => {
      const grain = document.querySelector(".pv-grain");
      const poster = document.querySelector(".event-visual--typographic");
      const read = (element: Element | null) =>
        element ? window.getComputedStyle(element, "::after").backgroundImage : "none";
      return { grain: read(grain), poster: read(poster) };
    });

    for (const [name, value] of Object.entries(textures)) {
      expect(
        value.includes("url("),
        `${name} texture must be generated in CSS, not downloaded: ${value}`,
      ).toBe(false);
    }
  });

  test("event content survives an artwork request failure", async ({ page }) => {
    await page.route("**/_next/image**", (route) => route.abort());
    await page.route("**/*.{png,jpg,jpeg,webp,avif}", (route) => route.abort());

    await page.setViewportSize(DESKTOP);
    await page.goto("/id");
    await skipUnlessVisualV2(page);

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByTestId("pv-hero-meta")).toBeVisible();
    await expect(page.getByTestId("pv-hero-primary-cta")).toBeVisible();
    await expect(page.getByTestId("pv-event-card").first()).toBeVisible();

    const slots = await readArtworkSlots(page);
    expect(slots.length, "artwork slots must still be rendered after an image failure").toBeGreaterThan(0);
  });

  test("keyboard focus on the hero CTA is visibly indicated", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/id");
    await skipUnlessVisualV2(page);

    const cta = page.getByTestId("pv-hero-primary-cta");
    await expect(cta).toBeVisible();

    const resting = await cta.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, boxShadow: style.boxShadow, clipPath: style.clipPath };
    });

    await page.locator("body").click({ position: { x: 4, y: 4 } });
    for (let step = 0; step < 30; step += 1) {
      await page.keyboard.press("Tab");
      const reached = await page.evaluate(
        () => document.activeElement?.getAttribute("data-testid") === "pv-hero-primary-cta",
      );
      if (reached) break;
    }

    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) return null;
      const style = window.getComputedStyle(element);
      return {
        testId: element.getAttribute("data-testid"),
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        clipPath: style.clipPath,
      };
    });

    expect(focused?.testId, "hero CTA must be reachable by keyboard").toBe("pv-hero-primary-cta");
    expect(focused?.focusVisible, "hero CTA must match :focus-visible after Tab").toBe(true);

    // `clip-path` cuts away any focus ring painted outside the element box, so a
    // clipped button must carry an inset indicator instead of the UA outline.
    const clipped = focused?.clipPath !== "none";
    const hasInsetRing = Boolean(focused?.boxShadow && focused.boxShadow.includes("inset"));
    const hasUnclippedOutline = !clipped && focused?.outlineStyle !== "none";

    expect(
      hasInsetRing || hasUnclippedOutline,
      `hero CTA has no visible focus indicator: clipPath=${focused?.clipPath} outlineStyle=${focused?.outlineStyle} ` +
        `outlineWidth=${focused?.outlineWidth} boxShadow=${focused?.boxShadow}`,
    ).toBe(true);

    expect(
      focused?.boxShadow,
      `focus must change the CTA indicator; resting boxShadow=${resting.boxShadow} focused boxShadow=${focused?.boxShadow}`,
    ).not.toBe(resting.boxShadow);
  });
});

test.describe("public visual v2 reduced motion", () => {
  test("motion is disabled when the visitor asks for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(DESKTOP);
    await page.goto("/id");
    await skipUnlessVisualV2(page);

    const emulated = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    expect(emulated, "reduced-motion emulation must be active or this gate proves nothing").toBe(true);

    const durations = await page.evaluate(() => {
      const toSeconds = (value: string) =>
        value
          .split(",")
          .map((part) => {
            const trimmed = part.trim();
            if (trimmed.endsWith("ms")) return Number.parseFloat(trimmed) / 1000;
            return Number.parseFloat(trimmed);
          })
          .filter((value) => Number.isFinite(value));

      return Array.from(document.querySelectorAll(".public-visual-v2 *")).map((element) => {
        const style = window.getComputedStyle(element);
        return {
          selector: element.className?.toString().slice(0, 60) ?? element.tagName,
          animation: Math.max(0, ...toSeconds(style.animationDuration)),
          transition: Math.max(0, ...toSeconds(style.transitionDuration)),
        };
      });
    });

    const animated = durations.filter((entry) => entry.animation > 0.01);
    const transitioned = durations.filter((entry) => entry.transition > 0.01);

    expect(
      animated,
      `elements still animate under prefers-reduced-motion: ${JSON.stringify(animated.slice(0, 5))}`,
    ).toEqual([]);
    expect(
      transitioned,
      `elements still transition under prefers-reduced-motion: ${JSON.stringify(transitioned.slice(0, 5))}`,
    ).toEqual([]);
  });
});
