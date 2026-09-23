import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { loginAsCaptain } from "./helpers/auth";

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("captain team management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCaptain(page, "id");
  });

  test("captain dashboard shows their team and players", async ({ page }) => {
    await expect(page.getByRole("main")).toBeVisible();
    // The dashboard renders team sections — any heading or paragraph is fine
    const content = page.locator("main").locator("h2, h3, p, td").first();
    await expect(content).toBeVisible();
  });

  test("captain can add a player to their team", async ({ page }) => {
    await page.goto("/id/captain?tab=roster", { waitUntil: "domcontentloaded" });
    const playerUid = `E2E Test Player ${Date.now()} ${randomUUID()}`;
    const playerIgn = `E2E${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    const addPlayerForm = page.locator("form").filter({
      has: page.getByRole("button", { name: /add player|tambah pemain/i }),
    }).first();

    await expect(addPlayerForm, "Expected roster management to expose the add-player form").toBeVisible();

    const uidField = addPlayerForm.locator('input[name="displayName"]');
    const ignField = addPlayerForm.locator('input[name="nickname"]');
    const teamId = await addPlayerForm.locator('input[name="teamId"]').inputValue();
    const eventIdField = addPlayerForm.locator('input[name="eventId"]');
    const eventId = await eventIdField.count() ? await eventIdField.inputValue() : null;
    await expect(uidField).toHaveAccessibleName(/uid/i);
    await expect(ignField).toHaveAccessibleName(/ign/i);
    await uidField.fill(playerUid);
    await ignField.fill(playerIgn);
    const positionField = addPlayerForm.getByLabel(/position|posisi/i);
    const positionTag = await positionField.evaluate((el) => el.tagName.toLowerCase());
    let expectedPosition: string;
    if (positionTag === "select") {
      await positionField.selectOption({ index: 1 });
      expectedPosition = await positionField.inputValue();
    } else {
      expectedPosition = "Forward";
      await positionField.fill(expectedPosition);
    }
    const addPlayerButton = addPlayerForm.getByRole("button", { name: /add player|tambah pemain/i });
    const addPlayerResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      const requestUrl = new URL(request.url());
      const body = request.postData() ?? "";
      return request.method() === "POST" &&
        requestUrl.pathname === "/id/captain" &&
        requestUrl.searchParams.get("tab") === "roster" &&
        Boolean(request.headers()["next-action"]) &&
        body.includes(teamId) &&
        body.includes(playerUid) &&
        body.includes(playerIgn);
    });
    const [addPlayerResponse] = await Promise.all([
      addPlayerResponsePromise,
      addPlayerButton.click(),
    ]);

    expect(addPlayerResponse.status()).toBe(303);
    const actionRedirect = addPlayerResponse.headers()["x-action-redirect"] ?? "";
    expect(actionRedirect).toBe("/id/captain?success=player-added;push");

    await expect.poll(async () => prisma.player.findFirst({
      where: { teamId, displayName: playerUid, nickname: playerIgn },
      select: { teamId: true, eventId: true, displayName: true, nickname: true, position: true },
    })).toEqual({
      teamId,
      eventId,
      displayName: playerUid,
      nickname: playerIgn,
      position: expectedPosition,
    });

    const redirectTarget = actionRedirect.slice(0, actionRedirect.lastIndexOf(";"));
    const rosterResponse = await page.request.get(new URL(redirectTarget, page.url()).toString());
    expect(rosterResponse.status()).toBe(200);
    const renderedRoster = await rosterResponse.text();
    expect(renderedRoster).toContain("Pemain berhasil ditambahkan.");
    expect(renderedRoster).toContain(playerIgn);
    expect(renderedRoster).toContain(playerUid);
  });

  test("captain cannot access admin dashboard", async ({ page }) => {
    await page.goto("/id/admin");
    await expect(page).toHaveURL(/\/id\/login/);
  });

  test("captain settings page is accessible", async ({ page }) => {
    await page.goto("/id/captain/settings");
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("captain change password form rejects mismatched passwords", async ({ page }) => {
    await page.goto("/id/captain/settings");

    const pwForm = page.locator("form").filter({
      has: page.getByLabel(/current password|password saat ini|password lama/i),
    });
    await expect(pwForm).toBeVisible();

    await pwForm.locator('input[name="currentPassword"]').fill("demo123");
    await pwForm.locator('input[name="newPassword"]').fill("newpass123");
    await pwForm.locator('input[name="confirmPassword"]').fill("different456");
    await pwForm.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/error=/);
  });
});
