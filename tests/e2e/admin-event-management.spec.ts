import { PrismaClient } from "@prisma/client";
import { expect, test, type Request, type Response } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function uploadRegistrationFile(page: import("@playwright/test").Page, file: {
  name: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const previewButton = page.getByRole("button", { name: /check and preview|cek dan preview/i });
  await expect(previewButton).toBeEnabled();
  await page.locator('input[name="registrationFile"]').setInputFiles(file);
  await Promise.all([
    page.waitForURL(
      (url) => url.searchParams.has("registrationBatchId") || url.searchParams.has("error"),
      { timeout: 30_000 },
    ),
    previewButton.click(),
  ]);

  const previewUrl = new URL(page.url());
  if (previewUrl.searchParams.has("error")) {
    throw new Error(`Registration preview failed: ${previewUrl.searchParams.get("error") || "Unknown error"}`);
  }

  const previewForm = page.locator("form").filter({
    has: page.locator('input[name="batchId"]'),
  });
  await expect(previewForm).toBeVisible({ timeout: 30_000 });
  return previewForm;
}

test.describe("admin event management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, "en");
  });

  test("admin keeps localized navbar when changing match management event", async ({ page }) => {
    await page.goto("/id/admin?phase=run");
    await expect(page).toHaveURL(/\/id\/admin\?phase=run$/);

    const changeEventButton = page.getByRole("button", { name: /ganti event|change event/i }).last();
    await expect(changeEventButton).toBeVisible();
    await expect(page.locator("header")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Event$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Admin$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /keluar|logout/i })).toBeVisible();

    await changeEventButton.click();

    await expect(page).toHaveURL(/\/id\/admin\?phase=run&matchEventId=/);
    await expect(page.locator("header")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Event$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Admin$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /keluar|logout/i })).toBeVisible();
  });

  test("admin can change event status from Draft to Published", async ({ page }) => {
    const event = await prisma.event.findUniqueOrThrow({
      where: { slug: "kuroko-summer-cup" },
      select: { id: true },
    });
    const eventStatusForm = page.locator("form").filter({
      has: page.getByRole("button", { name: "Save event status" }),
    });
    await eventStatusForm.getByLabel("Event").selectOption({ label: "Kuroko Street Rival Summer Cup" });
    await eventStatusForm.getByLabel("Status").selectOption("Published");
    await Promise.all([
      page.waitForURL(/success=event-status-updated/, { waitUntil: "load", timeout: 30_000 }),
      eventStatusForm.getByRole("button", { name: "Save event status" }).click(),
    ]);
    await expect.poll(async () => (await prisma.event.findUnique({
      where: { id: event.id },
      select: { status: true },
    }))?.status, { timeout: 30_000 }).toBe("Published");
  });

  test("admin can import teams via CSV and see success count", async ({ page }) => {
    test.setTimeout(90_000);
    const event = await prisma.event.findUnique({ where: { slug: "kuroko-summer-cup" } });
    expect(event, "Expected the seeded Kuroko event to exist").not.toBeNull();
    if (!event) return;

    const completedMatches = await prisma.match.count({ where: { eventId: event.id, status: "Completed" } });
    expect(completedMatches, "Expected the seeded Kuroko event to be unlocked").toBe(0);
    await prisma.team.deleteMany({
      where: {
        eventId: event.id,
        OR: [{ tag: "ETA" }, { name: "E2E Team Alpha" }],
      },
    });

    await page.goto(`/en/admin?phase=import&activeEventId=${event.id}`);
    const previewForm = await uploadRegistrationFile(page, {
      name: "test-import.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "event_slug,team_name,team_tag,captain_name,captain_contact,captain_ign,captain_uid,Player 1 Nickname,Player 2 Nickname\nkuroko-summer-cup,E2E Team Alpha,KS1,E2E Captain,e2ecap@test.com,E2ECaptain,UID-E2E,E2EPlayer,E2EPlayer2\n",
      ),
    });
    await expect(previewForm.locator('input[name="itemId"]:checked')).toHaveCount(1);

    await Promise.all([
      page.waitForURL(
        (url) => url.searchParams.get("success") === "registration-imported" || url.searchParams.has("error"),
        { timeout: 75_000 },
      ),
      previewForm.getByRole("button", { name: /import selected rows|import baris terpilih/i }).click(),
    ]);

    const importError = new URL(page.url()).searchParams.get("error");
    if (importError) throw new Error(`Registration commit failed: ${importError}`);

    await expect(page).toHaveURL(/success=registration-imported&count=1/);
  });

  test("admin sees error when importing CSV after bracket is locked", async ({ page }) => {
    const events = await prisma.event.findMany({ select: { id: true } });
    let lockedEventId: string | null = null;
    for (const event of events) {
      const completedMatches = await prisma.match.count({ where: { eventId: event.id, status: "Completed" } });
      if (completedMatches > 0) {
        lockedEventId = event.id;
        break;
      }
    }
    if (!lockedEventId) {
      test.skip();
      return;
    }

    await page.goto(`/en/admin?phase=import&activeEventId=${lockedEventId}`);
    const lateImportFile = "tests/fixtures/late-import-after-lock.csv";
    const previewButton = page.getByRole("button", { name: /check and preview|cek dan preview/i });
    await expect(previewButton).toBeEnabled();
    await page.locator('input[name="registrationFile"]').setInputFiles(lateImportFile);

    function isLockedRosterPreviewSettlement(response: Response, eventId: string) {
      const request = response.request();
      const url = new URL(response.url());
      return response.status() === 200
        && request.method() === "GET"
        && url.pathname === "/en/admin"
        && url.searchParams.get("phase") === "registration"
        && url.searchParams.get("activeEventId") === eventId
        && url.searchParams.has("registrationBatchId")
        && Boolean(url.searchParams.get("registrationBatchId"))
        && url.searchParams.get("success") === "registration-preview-ready"
        && (request.headers()["rsc"] === "1" || request.resourceType() === "document");
    }

    const settledPreviewUrl = page.waitForURL(
      (url) => url.pathname === "/en/admin"
        && url.searchParams.get("phase") === "registration"
        && url.searchParams.get("activeEventId") === lockedEventId
        && url.searchParams.has("registrationBatchId")
        && Boolean(url.searchParams.get("registrationBatchId"))
        && url.searchParams.get("success") === "registration-preview-ready",
      { waitUntil: "domcontentloaded" },
    );
    const settledPreviewResponse = new Promise<Response>((resolve) => {
      const onRequestFinished = async (request: Request) => {
        const response = await request.response();
        if (!response || !isLockedRosterPreviewSettlement(response, lockedEventId)) return;
        page.off("requestfinished", onRequestFinished);
        resolve(response);
      };
      page.on("requestfinished", onRequestFinished);
    });
    const [, settlementResponse] = await Promise.all([
      settledPreviewUrl,
      settledPreviewResponse,
      previewButton.click(),
    ]);
    expect(await settlementResponse.finished()).toBeNull();
    await expect(page.getByText(/drawing.*dipublikasikan|roster.*terkunci|turnamen.*berjalan/i)).toBeVisible();
  });

  test("admin can update live stream URL", async ({ page }) => {
    await page.goto("/en/admin?phase=prepare", { waitUntil: "domcontentloaded" });
    const streamForm = page.locator("form").filter({
      has: page.locator('input[name="url"]'),
    });

    await expect(streamForm, "Expected the active event stream form to be available").toBeVisible();

    await streamForm.getByLabel(/stream url/i).fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await streamForm.getByLabel(/stream label/i).fill("Day 1 Stream");
    const redirected = page.waitForURL(
      (url) => url.pathname === "/en/admin" && url.searchParams.get("success") === "stream-updated",
      { waitUntil: "domcontentloaded" },
    );
    await Promise.all([
      redirected,
      streamForm.getByRole("button", { name: /save|simpan/i }).click(),
    ]);

    await expect(page).toHaveURL(/success=stream-updated/);
  });
});
