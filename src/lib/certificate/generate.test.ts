import { beforeEach, describe, expect, it, vi } from "vitest";

const launchCertificateBrowser = vi.fn();
const recordCertificateSuccess = vi.fn();
const recordCertificateFailure = vi.fn();
const getCertificateByEvent = vi.fn();
const countCertificatesForGame = vi.fn();
const buildCertificateHtml = vi.fn();
const findFirstMatch = vi.fn();
const findUniqueEvent = vi.fn();
const findFirstTeam = vi.fn();

vi.mock("./browser", () => ({ launchCertificateBrowser }));
vi.mock("./template", () => ({ buildCertificateHtml }));
vi.mock("@/lib/platform/config", () => ({
  getGameConfig: () => ({ name: "Flashpeak", slug: "flashpeak" }),
}));
vi.mock("@/lib/platform/repository", () => ({
  recordCertificateSuccess,
  recordCertificateFailure,
  getCertificateByEvent,
  countCertificatesForGame,
}));
vi.mock("@/lib/platform/db", () => ({
  prisma: {
    match: { findFirst: findFirstMatch },
    event: { findUnique: findUniqueEvent },
    team: { findFirst: findFirstTeam },
  },
}));

const { generateCertificate, generateCertificateIfFinal } = await import("./generate");

const readyCertificate = {
  id: "cert-1",
  eventId: "event-1",
  teamId: "team-1",
  imageUrl: "https://blob.example/cert.png",
  status: "ready" as const,
  lastError: null,
  attemptCount: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  countCertificatesForGame.mockResolvedValue(0);
  buildCertificateHtml.mockResolvedValue("<html></html>");
  findUniqueEvent.mockResolvedValue({
    id: "event-1",
    name: "Miracle Cup",
    slug: "miracle-cup",
    gameId: "game-flashpeak",
    accentColor: "#16a34a",
    characterArtUrl: null,
  });
  findFirstTeam.mockResolvedValue({ id: "team-1", name: "Quantum Vanguard" });
});

describe("generateCertificate", () => {
  it("records the failure and rethrows when the browser cannot be launched", async () => {
    // This is the production failure mode: playwright-core ships no binary, so on Vercel the
    // launch throws unless a Lambda chromium pack is supplied.
    launchCertificateBrowser.mockRejectedValue(new Error("CHROMIUM_PACK_URL is not set."));

    await expect(generateCertificate("event-1", "team-1")).rejects.toThrow("CHROMIUM_PACK_URL is not set.");

    expect(recordCertificateFailure).toHaveBeenCalledWith("event-1", "team-1", "CHROMIUM_PACK_URL is not set.");
    expect(recordCertificateSuccess).not.toHaveBeenCalled();
  });

  it("records the failure when the event is missing", async () => {
    findUniqueEvent.mockResolvedValue(null);

    await expect(generateCertificate("event-1", "team-1")).rejects.toThrow("Event not found: event-1");

    expect(recordCertificateFailure).toHaveBeenCalledWith("event-1", "team-1", "Event not found: event-1");
  });

  it("truncates nothing itself and passes the raw message to the repository", async () => {
    // Truncation is the repository's job; the generator must not silently reshape the message.
    const longMessage = "x".repeat(900);
    launchCertificateBrowser.mockRejectedValue(new Error(longMessage));

    await expect(generateCertificate("event-1", "team-1")).rejects.toThrow();

    expect(recordCertificateFailure).toHaveBeenCalledWith("event-1", "team-1", longMessage);
  });
});

describe("generateCertificateIfFinal", () => {
  const finalMatch = { id: "match-1", eventId: "event-1", winnerTeamId: "team-1", roundLabel: "Final" };

  it("skips when a certificate is already ready", async () => {
    findFirstMatch.mockResolvedValue(finalMatch);
    getCertificateByEvent.mockResolvedValue(readyCertificate);

    await generateCertificateIfFinal("match-1", "event-1");

    expect(launchCertificateBrowser).not.toHaveBeenCalled();
  });

  it("retries when the previous attempt failed", async () => {
    // A failed row must not permanently block regeneration.
    findFirstMatch.mockResolvedValue(finalMatch);
    getCertificateByEvent.mockResolvedValue({ ...readyCertificate, status: "failed", imageUrl: "" });
    launchCertificateBrowser.mockRejectedValue(new Error("boom"));

    await expect(generateCertificateIfFinal("match-1", "event-1")).rejects.toThrow("boom");

    expect(launchCertificateBrowser).toHaveBeenCalled();
  });

  it("does nothing for a match that is not the Final", async () => {
    findFirstMatch.mockResolvedValue({ ...finalMatch, roundLabel: "Semifinal" });

    await generateCertificateIfFinal("match-1", "event-1");

    expect(getCertificateByEvent).not.toHaveBeenCalled();
    expect(launchCertificateBrowser).not.toHaveBeenCalled();
  });

  it("does nothing for a Final without a winner", async () => {
    findFirstMatch.mockResolvedValue({ ...finalMatch, winnerTeamId: null });

    await generateCertificateIfFinal("match-1", "event-1");

    expect(launchCertificateBrowser).not.toHaveBeenCalled();
  });
});
