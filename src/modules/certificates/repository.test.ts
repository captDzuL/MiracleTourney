import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, launchCertificateBrowser, buildCertificateHtml, blobPut } = vi.hoisted(() => ({
  prisma: {
    match: { findFirst: vi.fn() },
    event: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    team: { findFirst: vi.fn() },
    certificate: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
  launchCertificateBrowser: vi.fn(),
  buildCertificateHtml: vi.fn(),
  blobPut: vi.fn(),
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("../../lib/certificate/browser", () => ({ launchCertificateBrowser }));
vi.mock("../../lib/certificate/template", () => ({ buildCertificateHtml }));
vi.mock("@/lib/platform/config", () => ({
  getGameConfig: () => ({ name: "Flashpeak", slug: "flashpeak" }),
}));
vi.mock("@vercel/blob", () => ({ put: blobPut }));

import { ForbiddenError, NotFoundError } from "@/modules/identity";

import {
  assertActorCanManageCertificateEvent,
  countCertificatesForGame,
  generateCertificate,
  generateCertificateIfFinal,
  getCertificateByEvent,
  getCertificatesForEvents,
  recordCertificateFailure,
  recordCertificateSuccess,
  regenerateCertificateForActor,
  updateCertificateAssetsForActor,
  updateEventCertificateAssets,
} from "./repository";

const organizerA = { userId: "org-a", role: "organizer" as const, tenantId: "org-a" };
const organizerB = { userId: "org-b", role: "organizer" as const, tenantId: "org-b" };
const platformAdmin = { userId: "admin-1", role: "platform_admin" as const, tenantId: null };

const readyCertificateRow = {
  id: "cert-1",
  eventId: "event-1",
  teamId: "team-1",
  imageUrl: "https://blob.example/cert.png",
  status: "ready",
  lastError: null,
  attemptCount: 1,
  createdAt: new Date("2026-09-07T00:00:00.000Z"),
  updatedAt: new Date("2026-09-07T00:00:00.000Z"),
};

function fakeBrowser() {
  const page = {
    setViewportSize: vi.fn(),
    setContent: vi.fn(),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("png-bytes")),
  };
  const browser = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn(),
  };
  return { browser, page };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  buildCertificateHtml.mockResolvedValue("<html></html>");
  prisma.certificate.count.mockResolvedValue(0);
  prisma.event.findUnique.mockResolvedValue({
    id: "event-1",
    name: "Miracle Cup",
    slug: "miracle-cup",
    gameId: "game-flashpeak",
    accentColor: "#16a34a",
    characterArtUrl: null,
  });
  prisma.team.findFirst.mockResolvedValue({ id: "team-1", name: "Quantum Vanguard" });
});

describe("assertActorCanManageCertificateEvent", () => {
  it("allows an organizer to manage their own event", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 1 }); // unrelated default
    const findFirstSpy = vi.fn().mockResolvedValue({ id: "event-1" });
    // @ts-expect-error augment mock for this scope only
    prisma.event.findFirst = findFirstSpy;

    await expect(assertActorCanManageCertificateEvent(organizerA, "event-1")).resolves.toBeUndefined();
    expect(findFirstSpy).toHaveBeenCalledWith({ where: { id: "event-1", organizerUserId: "org-a" }, select: { id: true } });
  });

  it("rejects an organizer managing another organizer's event", async () => {
    // @ts-expect-error augment mock for this scope only
    prisma.event.findFirst = vi.fn().mockResolvedValue(null);

    await expect(assertActorCanManageCertificateEvent(organizerB, "event-1")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assertActorCanManageCertificateEvent(organizerB, "event-1")).rejects.toThrow("Not authorized");
  });

  it("allows platform admin to bypass ownership scoping entirely", async () => {
    // @ts-expect-error augment mock for this scope only
    prisma.event.findFirst = vi.fn();

    await expect(assertActorCanManageCertificateEvent(platformAdmin, "event-1")).resolves.toBeUndefined();
    // @ts-expect-error see above
    expect(prisma.event.findFirst).not.toHaveBeenCalled();
  });
});

describe("updateCertificateAssetsForActor", () => {
  it("writes character art/accent-color updates only for rows the organizer owns (ownership-scoped write)", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 1 });

    await updateCertificateAssetsForActor(organizerA, "event-1", { characterArtUrl: "https://blob.example/art.png" });

    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-a" },
      data: { characterArtUrl: "https://blob.example/art.png" },
    });
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("denies the write when the ownership-scoped update matches zero rows (cross-tenant attempt)", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateCertificateAssetsForActor(organizerB, "event-owned-by-a", { accentColor: "#ff0000" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateCertificateAssetsForActor(organizerB, "event-owned-by-a", { accentColor: "#ff0000" }),
    ).rejects.toThrow("Not authorized");
  });

  it("lets platform admin write across tenants without an ownership predicate", async () => {
    await updateCertificateAssetsForActor(platformAdmin, "event-1", { accentColor: "#111111" });

    expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: "event-1" }, data: { accentColor: "#111111" } });
    expect(prisma.event.updateMany).not.toHaveBeenCalled();
  });
});

describe("updateEventCertificateAssets (actor-less compatibility surface)", () => {
  it("writes directly with no ownership check, matching the legacy contract", async () => {
    await updateEventCertificateAssets("event-1", { accentColor: "#222222" });

    expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: "event-1" }, data: { accentColor: "#222222" } });
  });
});

describe("recordCertificateSuccess / recordCertificateFailure", () => {
  it("marks the certificate ready, clears lastError, and increments attemptCount", async () => {
    prisma.certificate.upsert.mockResolvedValue({ ...readyCertificateRow });

    await recordCertificateSuccess("event-1", "team-1", "https://blob.example/cert.png");

    expect(prisma.certificate.upsert).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
      update: { teamId: "team-1", imageUrl: "https://blob.example/cert.png", status: "ready", lastError: null, attemptCount: { increment: 1 } },
      create: { eventId: "event-1", teamId: "team-1", imageUrl: "https://blob.example/cert.png", status: "ready", lastError: null, attemptCount: 1 },
    });
  });

  it("truncates a failure message to 500 characters before persisting", async () => {
    const longMessage = "x".repeat(900);
    prisma.certificate.upsert.mockResolvedValue({ ...readyCertificateRow, status: "failed", lastError: longMessage.slice(0, 500) });

    await recordCertificateFailure("event-1", "team-1", longMessage);

    expect(prisma.certificate.upsert).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
      update: { teamId: "team-1", status: "failed", lastError: "x".repeat(500), attemptCount: { increment: 1 } },
      create: { eventId: "event-1", teamId: "team-1", imageUrl: "", status: "failed", lastError: "x".repeat(500), attemptCount: 1 },
    });
  });
});

describe("getCertificateByEvent / getCertificatesForEvents / countCertificatesForGame", () => {
  it("returns null when no certificate exists", async () => {
    prisma.certificate.findUnique.mockResolvedValue(null);
    await expect(getCertificateByEvent("event-1")).resolves.toBeNull();
  });

  it("batch-fetches certificates for multiple events", async () => {
    prisma.certificate.findMany.mockResolvedValue([readyCertificateRow]);

    const result = await getCertificatesForEvents(["event-1", "event-2"]);

    expect(result.get("event-1")).toMatchObject({ id: "cert-1", status: "ready" });
    expect(result.get("event-2")).toBeNull();
  });

  it("counts only ready certificates for a game", async () => {
    prisma.certificate.count.mockResolvedValue(3);
    await expect(countCertificatesForGame("game-flashpeak")).resolves.toBe(3);
    expect(prisma.certificate.count).toHaveBeenCalledWith({ where: { status: "ready", event: { gameId: "game-flashpeak" } } });
  });
});

describe("generateCertificate", () => {
  it("refuses a winner team that does not belong to the supplied event, before ever launching a browser", async () => {
    prisma.team.findFirst.mockResolvedValue(null); // simulates team-id-from-another-event

    await expect(generateCertificate("event-1", "team-from-other-event")).rejects.toThrow("Team not found: team-from-other-event");

    expect(prisma.team.findFirst).toHaveBeenCalledWith({ where: { id: "team-from-other-event", eventId: "event-1" } });
    expect(launchCertificateBrowser).not.toHaveBeenCalled();
    expect(prisma.certificate.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: "failed" }),
    }));
  });

  it("records the failure and rethrows when the browser cannot be launched", async () => {
    launchCertificateBrowser.mockRejectedValue(new Error("CHROMIUM_PACK_URL is not set."));

    await expect(generateCertificate("event-1", "team-1")).rejects.toThrow("CHROMIUM_PACK_URL is not set.");

    expect(prisma.certificate.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: "failed", lastError: "CHROMIUM_PACK_URL is not set." }),
    }));
  });

  it("records the failure when the event is missing", async () => {
    prisma.event.findUnique.mockResolvedValue(null);

    await expect(generateCertificate("event-1", "team-1")).rejects.toThrow("Event not found: event-1");
  });

  it("renders, uploads to Blob, records success, and always closes the browser", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    const { browser } = fakeBrowser();
    launchCertificateBrowser.mockResolvedValue(browser);
    blobPut.mockResolvedValue({ url: "https://blob.example/cert-final.png" });
    prisma.certificate.upsert.mockResolvedValue({ ...readyCertificateRow });

    const url = await generateCertificate("event-1", "team-1");

    expect(url).toBe("https://blob.example/cert-final.png");
    expect(blobPut).toHaveBeenCalledWith(expect.stringContaining("certificates/event-1-team-1-"), expect.any(Buffer), {
      access: "public",
      contentType: "image/png",
    });
    expect(prisma.certificate.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: "ready", imageUrl: "https://blob.example/cert-final.png" }),
    }));
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("still closes the browser and rethrows when rendering fails after the browser has launched", async () => {
    const { browser, page } = fakeBrowser();
    page.screenshot.mockRejectedValue(new Error("render timed out"));
    launchCertificateBrowser.mockResolvedValue(browser);

    await expect(generateCertificate("event-1", "team-1")).rejects.toThrow("render timed out");

    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(prisma.certificate.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: "failed", lastError: "render timed out" }),
    }));
  });
});

describe("generateCertificateIfFinal", () => {
  const finalMatch = { id: "match-1", eventId: "event-1", winnerTeamId: "team-1", roundLabel: "Final" };

  it("scopes the match lookup to the supplied event", async () => {
    prisma.match.findFirst.mockResolvedValue(null);

    await generateCertificateIfFinal("match-1", "event-1");

    expect(prisma.match.findFirst).toHaveBeenCalledWith({ where: { id: "match-1", eventId: "event-1" } });
  });

  it("does nothing for a match that is not the Final", async () => {
    prisma.match.findFirst.mockResolvedValue({ ...finalMatch, roundLabel: "Semifinal" });
    await generateCertificateIfFinal("match-1", "event-1");
    expect(launchCertificateBrowser).not.toHaveBeenCalled();
  });

  it("does nothing for a Final without a winner", async () => {
    prisma.match.findFirst.mockResolvedValue({ ...finalMatch, winnerTeamId: null });
    await generateCertificateIfFinal("match-1", "event-1");
    expect(launchCertificateBrowser).not.toHaveBeenCalled();
  });

  it("skips when a certificate is already ready", async () => {
    prisma.match.findFirst.mockResolvedValue(finalMatch);
    prisma.certificate.findUnique.mockResolvedValue(readyCertificateRow);

    await generateCertificateIfFinal("match-1", "event-1");

    expect(launchCertificateBrowser).not.toHaveBeenCalled();
  });

  it("retries when the previous attempt failed", async () => {
    prisma.match.findFirst.mockResolvedValue(finalMatch);
    prisma.certificate.findUnique.mockResolvedValue({ ...readyCertificateRow, status: "failed", imageUrl: "" });
    launchCertificateBrowser.mockRejectedValue(new Error("boom"));

    await expect(generateCertificateIfFinal("match-1", "event-1")).rejects.toThrow("boom");

    expect(launchCertificateBrowser).toHaveBeenCalled();
  });
});

describe("regenerateCertificateForActor", () => {
  it("denies an organizer regenerating another organizer's certificate without ever looking up a match", async () => {
    // @ts-expect-error augment mock for this scope only
    prisma.event.findFirst = vi.fn().mockResolvedValue(null);

    await expect(regenerateCertificateForActor(organizerB, "event-owned-by-a")).rejects.toBeInstanceOf(ForbiddenError);
    expect(prisma.match.findFirst).not.toHaveBeenCalled();
  });

  it("looks up the Final winner scoped to the authorized event only", async () => {
    // @ts-expect-error augment mock for this scope only
    prisma.event.findFirst = vi.fn().mockResolvedValue({ id: "event-1" });
    prisma.match.findFirst.mockResolvedValue({ winnerTeamId: "team-1" });
    process.env.BLOB_READ_WRITE_TOKEN = "test-token"; // force the Blob path so the test never touches the real filesystem
    const { browser } = fakeBrowser();
    launchCertificateBrowser.mockResolvedValue(browser);
    blobPut.mockResolvedValue({ url: "https://blob.example/cert-regen.png" });
    prisma.certificate.upsert.mockResolvedValue(readyCertificateRow);

    await regenerateCertificateForActor(organizerA, "event-1");

    expect(prisma.match.findFirst).toHaveBeenCalledWith({
      where: { eventId: "event-1", roundLabel: "Final", winnerTeamId: { not: null } },
      select: { winnerTeamId: true },
    });
  });

  it("refuses to regenerate when the event has no Final winner yet", async () => {
    // @ts-expect-error augment mock for this scope only
    prisma.event.findFirst = vi.fn().mockResolvedValue({ id: "event-1" });
    prisma.match.findFirst.mockResolvedValue(null);

    await expect(regenerateCertificateForActor(organizerA, "event-1")).rejects.toBeInstanceOf(NotFoundError);
    await expect(regenerateCertificateForActor(organizerA, "event-1")).rejects.toThrow(
      "Belum ada juara. Simpan hasil match Final terlebih dahulu.",
    );
    expect(launchCertificateBrowser).not.toHaveBeenCalled();
  });
});
