import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { loginWithCredentials } from "./helpers/auth";
import { prepareAdaptivePublicRegistrationFixtures } from "./helpers/fixtures";

const prisma = new PrismaClient();
let fixture: Awaited<ReturnType<typeof prepareAdaptivePublicRegistrationFixtures>>;
let uploadedProofUrl: string | null = null;

test.describe.serial("Adaptive Public Event V3 registration phase", () => {
  test.describe.configure({ timeout: 90_000 });
  test.beforeAll(async () => {
    fixture = await prepareAdaptivePublicRegistrationFixtures();
  });

  test.afterAll(async () => {
    await fixture.cleanup();
    if (uploadedProofUrl?.startsWith("/payment-proofs/")) {
      await fs.rm(path.join(process.cwd(), "public", uploadedProofUrl), { force: true });
    }
    await prisma.$disconnect();
  });

  test("guest sees complete event details and keeps event context through Captain login", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "198.18.1.10" });
    await page.goto("/id/events/" + fixture.events.open.slug);

    await expect(page.getByRole("heading", { level: 1, name: fixture.events.open.name })).toBeVisible();
    await expect(page.getByTestId("adaptive-event-poster")).toBeVisible();
    await expect(page.getByTestId("adaptive-event-logo")).toBeVisible();
    await expect(page.getByText("Mobile Legends \u00b7 5v5")).toBeVisible();
    await expect(page.getByText("Miracle Community", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("+62 812 3456 7890")).toBeVisible();
    await expect(page.getByText("Rp20.000")).toBeVisible();
    await expect(page.getByText("Rp5.000.000")).toBeVisible();
    await expect(page.getByText(/0 dari 8 slot terisi/)).toBeVisible();

    const trigger = page.getByRole("button", { name: "Daftarkan tim" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Lanjutkan pendaftaranmu" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Kamu akan kembali ke event ini")).toBeVisible();
    await expect(dialog.getByText(new RegExp(fixture.events.open.name))).toBeVisible();
    await expect(dialog.getByLabel("Email")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByLabel("Email").fill("wrong@example.test");
    await dialog.getByLabel("Kata sandi").fill("wrong-password");
    await dialog.getByRole("button", { name: "Masuk dan lanjutkan" }).click();
    await expect(dialog.getByRole("alert")).toContainText("tidak cocok");
    await expect(dialog.getByText(new RegExp(fixture.events.open.name))).toBeVisible();

    await dialog.getByLabel("Email").fill(fixture.captain.email);
    await dialog.getByLabel("Kata sandi").fill(fixture.password);
    await dialog.getByRole("button", { name: "Masuk dan lanjutkan" }).click();
    await expect(page).toHaveURL(new RegExp("/id/captain\\?tab=registration&eventId=" + fixture.events.open.id), { timeout: 20_000 });
    await expect(page.getByTestId("registration-flow-event-name")).toHaveText(fixture.events.open.name);
  });

  test("signup returns a new Captain to the same event registration", async ({ page }) => {
    await page.goto("/id/events/" + fixture.events.open.slug);
    await page.getByRole("button", { name: "Daftarkan tim" }).click();
    const signupLink = page.getByRole("link", { name: "Daftar sebagai captain" });
    await expect(signupLink).toHaveAttribute("href", "/id/register?eventId=" + fixture.events.open.id);
    await page.goto((await signupLink.getAttribute("href"))!);
    await expect(page).toHaveURL(new RegExp("/id/register\\?eventId=" + fixture.events.open.id), { timeout: 20_000 });

    await page.getByLabel("Nama lengkap").fill("Captain Signup Adaptive");
    await page.getByLabel("Email").fill(fixture.signupEmail);
    await page.getByLabel("Password", { exact: true }).fill(fixture.password);
    await page.getByLabel("Konfirmasi password").fill(fixture.password);
    await page.getByRole("button", { name: /buat akun/i }).click();

    await expect(page).toHaveURL(new RegExp("/id/captain\\?tab=registration&eventId=" + fixture.events.open.id), { timeout: 20_000 });
    await expect(page.getByTestId("registration-flow-event-name")).toHaveText(fixture.events.open.name);
  });

  test("Captain journey state takes priority over the general registration CTA", async ({ page }) => {
    await loginWithCredentials(page, {
      locale: "id",
      email: fixture.captain.email,
      password: fixture.password,
      destination: /\/id\/captain/,
    });

    await page.goto("/id/events/" + fixture.events.open.slug);
    await expect(page.getByRole("link", { name: "Buat tim dan daftar" })).toBeVisible();

    const draftTeam = await prisma.team.create({
      data: {
        captainId: fixture.captain.id,
        name: "Adaptive Draft " + fixture.suffix,
        tag: "ADT",
        logoText: "AD",
        source: "captain-draft",
      },
    });
    await prisma.player.create({
      data: {
        teamId: draftTeam.id,
        displayName: "Adaptive Player",
        nickname: "Adaptive",
        position: "",
      },
    });
    await page.reload();
    await expect(page.getByRole("link", { name: "Pilih tim untuk didaftarkan" })).toBeVisible();

    const request = await prisma.teamRegistrationRequest.create({
      data: {
        eventId: fixture.events.open.id,
        captainId: fixture.captain.id,
        teamName: draftTeam.name,
        teamTag: draftTeam.tag,
        status: "pending_payment",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await page.reload();
    await expect(page.getByRole("link", { name: "Lanjutkan pembayaran" })).toBeVisible();
    await expect(page.getByText(/0 dari 8 slot terisi/)).toBeVisible();

    await prisma.teamRegistrationRequest.update({
      where: { id: request.id },
      data: { status: "pending_review" },
    });
    await page.reload();
    await expect(page.getByRole("link", { name: "Lihat status pendaftaran" })).toBeVisible();
    await expect(page.getByText(/1 dari 8 slot terisi/)).toBeVisible();

    await prisma.teamRegistrationRequest.update({
      where: { id: request.id },
      data: { status: "rejected", expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    await page.reload();
    await expect(page.getByRole("link", { name: "Perbaiki bukti pembayaran" })).toBeVisible();

    await prisma.teamRegistrationRequest.update({
      where: { id: request.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await page.reload();
    await expect(page.getByRole("link", { name: "Daftar ulang" })).toBeVisible();

    await prisma.teamRegistrationRequest.delete({ where: { id: request.id } });
    await prisma.team.update({ where: { id: draftTeam.id }, data: { eventId: fixture.events.open.id } });
    await page.reload();
    await expect(page.getByRole("link", { name: "Lihat tim terdaftar" })).toBeVisible();
  });

  test("payment proof atomically changes status and begins occupying a public slot", async ({ page }) => {
    await loginWithCredentials(page, {
      locale: "id",
      email: fixture.paymentCaptain.email,
      password: fixture.password,
      destination: /\/id\/captain/,
    });
    const initialOccupied = await prisma.team.count({ where: { eventId: fixture.events.open.id } })
      + await prisma.teamRegistrationRequest.count({ where: { eventId: fixture.events.open.id, status: "pending_review" } });
    await page.goto("/id/events/" + fixture.events.open.slug);
    await expect(page.getByRole("link", { name: "Lanjutkan pembayaran" })).toBeVisible();
    await expect(page.getByText(new RegExp(initialOccupied + " dari 8 slot terisi"))).toBeVisible();

    await page.goto("/id/captain?tab=registration&eventId=" + fixture.events.open.id);
    await expect(page.getByTestId("registration-flow-event-name")).toHaveText(fixture.events.open.name);
    await page.locator('input[name="paymentProof"]').setInputFiles({
      name: "proof.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    });
    await page.getByRole("button", { name: /upload bukti bayar/i }).click();
    await expect(page).toHaveURL(new RegExp("eventId=" + fixture.events.open.id + ".*success=payment-proof-uploaded"), { timeout: 20_000 });

    const request = await prisma.teamRegistrationRequest.findUniqueOrThrow({
      where: { id: fixture.paymentRequest.id },
      select: { status: true, proofImageUrl: true },
    });
    expect(request.status).toBe("pending_review");
    uploadedProofUrl = request.proofImageUrl;

    await page.goto("/id/events/" + fixture.events.open.slug);
    await expect(page.getByRole("link", { name: "Lihat status pendaftaran" })).toBeVisible();
    await expect(page.getByText(new RegExp((initialOccupied + 1) + " dari 8 slot terisi"))).toBeVisible();
  });

  test("upcoming, closed, full, English, and mobile states remain accessible", async ({ page }) => {
    await page.goto("/id/events/" + fixture.events.upcoming.slug);
    await expect(page.getByRole("button", { name: "Pendaftaran belum dibuka" })).toBeDisabled();

    await page.goto("/id/events/" + fixture.events.closed.slug);
    await expect(page.getByRole("button", { name: "Pendaftaran ditutup" })).toBeDisabled();

    await page.goto("/id/events/" + fixture.events.full.slug);
    await expect(page.getByRole("button", { name: "Slot pendaftaran penuh" })).toBeDisabled();

    await page.goto("/en/events/" + fixture.events.open.slug);
    await expect(page).toHaveURL(new RegExp("/en/events/" + fixture.events.open.slug));
    await expect(page.getByRole("button", { name: "Register a team" })).toBeVisible();
    await expect(page.getByText("Registration period")).toBeVisible();

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/id/events/" + fixture.events.open.slug);
    const pageWidth = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client);
    await expect(page.getByRole("button", { name: "Daftarkan tim" })).toBeInViewport();
  });
});
