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
  const assets = fixture
    ? await completionDb.eventVisualAsset.findMany({ where: { eventId: fixture.id }, select: { storageKey: true } })
    : [];
  await fixture?.cleanup();
  fixture = undefined;
  const files = [...createdFiles.splice(0), ...assets.flatMap(({ storageKey }) => storageKey ? [path.join(PUBLIC_DIR, ...storageKey.split("/"))] : [])];
  await Promise.all(files.map((file) => rm(file, { force: true })));
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
  const logoUrl = await writeTeamLogoFile(ready.id);
  await completionDb.team.updateMany({ where: { eventId: ready.id }, data: { logoUrl } });
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

test("an admin turns a team's existing logo into a certificate for an event without an organizer", async ({ page }) => {
  test.slow();
  const event = await preparePlatformOwnedCompletedEvent();
  await loginAsAdmin(page, "en");
  await page.goto(`/en/organizer/events/${encodeURIComponent(event.id)}/certificates`);

  await expect(page.locator("[data-certificate-type]")).toHaveCount(7);
  await expect(page.locator('[data-hydration-ready="true"]')).toHaveCount(1);
  await page.locator('[data-certificate-type="champion"]').click();

  const assetSelect = page.locator("[data-certificate-assets] select").first();
  await expect(assetSelect).toHaveValue("");
  await page.locator("[data-import-team-logo]").click();
  await expect(assetSelect).not.toHaveValue("");
  await expect(page.locator("[data-team-logo-error]")).toHaveCount(0);
  await expect.poll(() => completionDb.eventVisualAsset.count({
    where: { eventId: event.id, source: "team_logo_import", purpose: "certificate_team_logo", status: "approved" },
  })).toBe(1);

  const regenerated = page.waitForResponse((response) => response.request().method() === "POST"
    && Boolean(response.request().headers()["next-action"])
    && (response.request().postData() ?? "").includes(event.id));
  await page.locator("[data-regenerate-certificate]").click();
  expect((await regenerated).status()).toBeLessThan(400);
  await expect(page.getByText("A new certificate version was generated.")).toBeVisible();

  await expect.poll(async () => (await completionDb.certificate.findMany({ where: { eventId: event.id, type: "champion" } })).map((row) => row.status)).toContain("ready");
  const preview = page.locator("[data-generated-artifact] img");
  await expect(preview).toBeVisible();
  // The rendered certificate must be a real, decoded image, not a broken placeholder.
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("studio-after-generate.png") });
  await preview.screenshot({ path: test.info().outputPath("certificate-preview.png") });
});

test("importing the same team logo twice reuses the approved asset", async ({ page }) => {
  test.slow();
  const event = await preparePlatformOwnedCompletedEvent();
  await loginAsAdmin(page, "en");
  await page.goto(`/en/organizer/events/${encodeURIComponent(event.id)}/certificates`);
  await expect(page.locator('[data-hydration-ready="true"]')).toHaveCount(1);
  await page.locator('[data-certificate-type="champion"]').click();

  const importButton = page.locator("[data-import-team-logo]");
  await importButton.click();
  await expect.poll(() => completionDb.eventVisualAsset.count({ where: { eventId: event.id, source: "team_logo_import" } })).toBe(1);
  await importButton.click();
  await page.waitForTimeout(1_500);
  expect(await completionDb.eventVisualAsset.count({ where: { eventId: event.id, source: "team_logo_import" } })).toBe(1);
});

test("a team without a usable logo shows a clear error and creates no asset", async ({ page }) => {
  test.slow();
  const event = await preparePlatformOwnedCompletedEvent();
  await completionDb.team.updateMany({ where: { eventId: event.id }, data: { logoUrl: "https://example.com/logo.png" } });
  await loginAsAdmin(page, "en");
  await page.goto(`/en/organizer/events/${encodeURIComponent(event.id)}/certificates`);
  await expect(page.locator('[data-hydration-ready="true"]')).toHaveCount(1);
  await page.locator('[data-certificate-type="champion"]').click();

  await page.locator("[data-import-team-logo]").click();
  await expect(page.locator("[data-team-logo-error]")).toBeVisible();
  await expect(page.locator("[data-certificate-assets] select").first()).toHaveValue("");
  expect(await completionDb.eventVisualAsset.count({ where: { eventId: event.id } })).toBe(0);
});
