import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { completeTournament } from "../../src/lib/completion/complete";
import { createPrismaCompletionDependencies } from "../../src/lib/completion/prisma-adapter";
import { loginAsAdmin } from "./helpers/auth";
import { completionDb, prepareCompletionFixture, type CompletionFixtureReady } from "./helpers/completion";

test.describe.configure({ mode: "serial" });

const PUBLIC_DIR = path.join(process.cwd(), "public");
const createdFiles: string[] = [];
let fixture: (CompletionFixtureReady & { id: string }) | undefined;

test.afterEach(async () => {
  await Promise.all(createdFiles.splice(0).map((file) => rm(file, { force: true })));
  const assets = fixture
    ? await completionDb.eventVisualAsset.findMany({ where: { eventId: fixture.id }, select: { storageKey: true } })
    : [];
  await fixture?.cleanup();
  fixture = undefined;
  await Promise.all(assets.flatMap(({ storageKey }) => storageKey ? [rm(path.join(PUBLIC_DIR, ...storageKey.split("/")), { force: true })] : []));
});

/** A real PNG under the exact name pattern uploadImageAsset produces, so the importer accepts it as a local team logo. */
async function writeTeamLogoFile(entityId: string): Promise<string> {
  const png = await sharp({ create: { width: 640, height: 640, channels: 4, background: { r: 36, g: 120, b: 220, alpha: 1 } } }).png().toBuffer();
  const name = `${entityId}-${createHash("sha256").update(png).digest("hex")}-${randomUUID()}.png`;
  await mkdir(path.join(PUBLIC_DIR, "team-logos"), { recursive: true });
  const file = path.join(PUBLIC_DIR, "team-logos", name);
  await writeFile(file, png);
  createdFiles.push(file);
  return `/team-logos/${name}`;
}

/** A finished event owned by the platform (no organizer), completed by an admin: the same shape as the old MFL events. */
async function preparePlatformOwnedCompletedEvent() {
  const ready = await prepareCompletionFixture("single_elimination", randomUUID().slice(0, 12));
  fixture = ready;
  const admin = await completionDb.user.findUniqueOrThrow({ where: { email: "admin@miraclefc.gg" }, select: { id: true, role: true } });
  await completionDb.event.update({ where: { id: ready.id }, data: { organizerUserId: null, organizerName: "Miracle", organizerVerified: true } });
  await completionDb.team.updateMany({ where: { eventId: ready.id }, data: { logoUrl: await writeTeamLogoFile(ready.id) } });
  const result = await completeTournament(
    ready.id,
    [
      { award: "mvp", playerId: ready.players[0].id },
      { award: "top_scorer", playerId: ready.players[0].id },
      { award: "top_defender", playerId: ready.players[0].id },
      { award: "top_assist", playerId: ready.players[0].id, reason: "Equal assists; decisive final contribution." },
    ],
    0,
    randomUUID(),
    createPrismaCompletionDependencies({ id: admin.id, role: admin.role as "admin" }, completionDb),
  );
  if (result.status !== "completed") throw new Error(`Unable to complete the fixture: ${JSON.stringify(result)}`);
  return ready;
}

test("the character gallery lists all nine Flash Peak characters on an award certificate", async ({ page }) => {
  test.slow();
  const event = await preparePlatformOwnedCompletedEvent();
  await loginAsAdmin(page, "en");
  await page.goto(`/en/organizer/events/${encodeURIComponent(event.id)}/certificates`);
  await expect(page.locator('[data-hydration-ready="true"]')).toHaveCount(1);

  await page.locator('[data-certificate-type="champion"]').click();
  await expect(page.locator("[data-character-gallery]")).toHaveCount(0);

  await page.locator('[data-certificate-type="top_scorer"]').click();
  const gallery = page.locator("[data-character-gallery]");
  await expect(gallery).toBeVisible();
  await expect(gallery.locator("[data-character-id]")).toHaveCount(9);
  const ids = await gallery.locator("[data-character-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-character-id")).sort());
  expect(ids).toEqual(["andrew", "ford", "hayato", "homer", "kelly", "maxim", "orion", "rafael", "shirou"]);
  for (const image of await gallery.locator("img").all()) {
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
});

test("picking a character stores it once and puts it on the generated award certificate", async ({ page }) => {
  test.slow();
  const event = await preparePlatformOwnedCompletedEvent();
  await loginAsAdmin(page, "en");
  await page.goto(`/en/organizer/events/${encodeURIComponent(event.id)}/certificates`);
  await expect(page.locator('[data-hydration-ready="true"]')).toHaveCount(1);
  await page.locator('[data-certificate-type="top_scorer"]').click();

  const shirou = page.locator('[data-character-gallery] [data-character-id="shirou"]');
  await shirou.click();
  await expect(shirou).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-character-error]")).toHaveCount(0);
  await expect.poll(() => completionDb.eventVisualAsset.count({
    where: { eventId: event.id, source: "character_library", purpose: "certificate_character_art", status: "approved" },
  })).toBe(1);

  // An award certificate also needs the team badge logo, which the studio imports from the team's own logo.
  const assetSelects = page.locator("[data-certificate-assets] select");
  await expect(assetSelects.first()).not.toHaveValue("");
  await page.locator("[data-import-team-logo]").click();
  await expect.poll(() => completionDb.eventVisualAsset.count({ where: { eventId: event.id, source: "team_logo_import" } })).toBe(1);

  const regenerated = page.waitForResponse((response) => response.request().method() === "POST"
    && Boolean(response.request().headers()["next-action"])
    && (response.request().postData() ?? "").includes(event.id));
  await page.locator("[data-regenerate-certificate]").click();
  expect((await regenerated).status()).toBeLessThan(400);
  // Generating the image takes a while on a busy machine; the default five seconds is not enough.
  await expect(page.getByText("A new certificate version was generated.")).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await completionDb.certificate.findMany({ where: { eventId: event.id, type: "top_scorer" } })).map((row) => row.status), { timeout: 30_000 }).toContain("ready");

  const preview = page.locator("[data-generated-artifact] img");
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("studio-award-with-character.png") });
  await preview.screenshot({ path: test.info().outputPath("award-certificate-with-character.png") });
});

test("picking the same character twice reuses the stored asset", async ({ page }) => {
  test.slow();
  const event = await preparePlatformOwnedCompletedEvent();
  await loginAsAdmin(page, "en");
  await page.goto(`/en/organizer/events/${encodeURIComponent(event.id)}/certificates`);
  await expect(page.locator('[data-hydration-ready="true"]')).toHaveCount(1);
  await page.locator('[data-certificate-type="top_scorer"]').click();

  await page.locator('[data-character-gallery] [data-character-id="kelly"]').click();
  await expect.poll(() => completionDb.eventVisualAsset.count({ where: { eventId: event.id, source: "character_library" } })).toBe(1);
  await page.locator('[data-certificate-type="mvp"]').click();
  await page.locator('[data-character-gallery] [data-character-id="kelly"]').click();
  await page.waitForTimeout(1_500);
  expect(await completionDb.eventVisualAsset.count({ where: { eventId: event.id, source: "character_library" } })).toBe(1);
});
