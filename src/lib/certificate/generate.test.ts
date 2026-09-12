import { beforeEach, describe, expect, it, vi } from "vitest";

const launchCertificateBrowser = vi.fn();
const recordCertificateSuccess = vi.fn();
const recordCertificateFailure = vi.fn();
const getCertificateByEvent = vi.fn();
const getLeaderboardForEvent = vi.fn();
const countCertificatesForGame = vi.fn();
const buildCertificateHtml = vi.fn();
const findFirstMatch = vi.fn();
const findUniqueEvent = vi.fn();
const findFirstTeam = vi.fn();
const findFirstCompletion = vi.fn();

vi.mock("./browser", () => ({ launchCertificateBrowser }));
vi.mock("./template", () => ({ buildCertificateHtml }));
vi.mock("@/lib/platform/config", () => ({
  getGameConfig: () => ({ name: "Flashpeak", slug: "flashpeak" }),
}));
vi.mock("@/lib/platform/repository", () => ({
  recordCertificateSuccess,
  recordCertificateFailure,
  getCertificateByEvent,
  getLeaderboardForEvent,
  countCertificatesForGame,
}));
vi.mock("@/lib/platform/db", () => ({
  prisma: {
    match: { findFirst: findFirstMatch },
    event: { findUnique: findUniqueEvent },
    team: { findFirst: findFirstTeam },
    tournamentCompletion: { findFirst: findFirstCompletion },
  },
}));

const { generateCertificate, generateCertificateIfFinal, generateMiracleV3Certificate } = await import("./generate");

const v3Data = {
  eventId: "event-1", eventName: "Miracle Cup", gameId: "game-flashpeak", gameName: "Flashpeak",
  certificateId: "cert-2", certificateType: "champion" as const, version: 2, templateVersion: "miracle-v3",
  recipientId: "team-1", recipientName: "Garuda Nova", recipientKind: "team" as const,
  teamId: "team-1", teamName: "Garuda Nova", teamLogoUrl: null, characterArtUrl: null,
  issueDate: "2026-09-05", verificationCode: "verify-2", verificationBaseUrl: "https://miracle-league.fun",
  branding: { cyan: "#49d1ec", violet: "#aa8bff", cream: "#f6dfb1" },
};

describe("versioned certificate generation", () => {
  it("preserves the primary render error and logs a rejected failure write", async () => {
    const primary = new Error("render failed first");
    const secondary = new Error("failure repository unavailable");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(generateMiracleV3Certificate({ data: v3Data }, {
        claimGeneration: async () => ({ status: "claimed", attemptId: "attempt-9" }),
        render: async () => { throw primary; },
        storeArtifact: async () => { throw new Error("Must not store"); },
        recordSuccess: async () => { throw new Error("Must not succeed"); },
        recordFailure: async () => { throw secondary; },
      })).rejects.toBe(primary);
      expect(log).toHaveBeenCalledWith("Certificate failure persistence failed", expect.objectContaining({ certificateId: "cert-2", attemptId: "attempt-9", error: secondary }));
    } finally { log.mockRestore(); }
  });
  it("encodes dot-only identity segments so artifacts cannot escape their event directory", async () => {
    let filename = "";
    await generateMiracleV3Certificate({ data: { ...v3Data, eventId: "..", recipientId: "." } }, {
      claimGeneration: async () => ({ status: "claimed", attemptId: "attempt-1" }),
      render: async () => Buffer.from("png"),
      storeArtifact: async artifact => { filename = artifact.filename; return "https://assets.example/cert.png"; },
      recordSuccess: async () => {}, recordFailure: async () => {},
    });
    expect(filename).toBe("certificates/%2E%2E/champion/%2E/v2/attempt-1.png");
  });
  it("stores a portrait artifact with event/type/recipient/version identity then persists success", async () => {
    const writes: unknown[] = [];
    const result = await generateMiracleV3Certificate({ data: v3Data }, {
      claimGeneration: async identity => { expect(identity).toEqual({ certificateId: "cert-2", eventId: "event-1", certificateType: "champion", recipientId: "team-1", version: 2 }); return { status: "claimed", attemptId: "attempt-7" }; },
      render: async html => { expect(html).toContain('data-certificate-canvas="1080x1920"'); expect(html).not.toContain("data-editor-guide"); return Buffer.from("png"); },
      storeArtifact: async artifact => { writes.push(artifact); return "https://assets.example/cert-v2.png"; },
      recordSuccess: async success => { writes.push(success); },
      recordFailure: async () => { throw new Error("Unexpected failure"); },
    });
    expect(result).toBe("https://assets.example/cert-v2.png");
    expect(writes).toEqual([
      { filename: "certificates/event-1/champion/team-1/v2/attempt-7.png", png: Buffer.from("png"), overwrite: false },
      { identity: { certificateId: "cert-2", eventId: "event-1", certificateType: "champion", recipientId: "team-1", version: 2 }, attemptId: "attempt-7", imageUrl: result, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) },
    ]);
  });
  it.each(["ready", "published"] as const)("returns %s history without rendering or writing", async status => {
    const forbidden = async () => { throw new Error("Immutable history touched"); };
    expect(await generateMiracleV3Certificate({ data: v3Data }, {
      claimGeneration: async () => ({ status, imageUrl: "https://assets.example/original.png" }),
      render: forbidden, storeArtifact: forbidden, recordSuccess: forbidden, recordFailure: forbidden,
    })).toBe("https://assets.example/original.png");
  });
  it.each(["render", "store"])("persists %s failure against the claimed version", async stage => {
    const failures: unknown[] = [];
    await expect(generateMiracleV3Certificate({ data: v3Data }, {
      claimGeneration: async () => ({ status: "claimed", attemptId: "attempt-8" }),
      render: async () => { if (stage === "render") throw new Error("failed stage"); return Buffer.from("png"); },
      storeArtifact: async () => { if (stage === "store") throw new Error("failed stage"); return "https://assets.example/cert.png"; },
      recordSuccess: async () => {},
      recordFailure: async failure => { failures.push(failure); },
    })).rejects.toThrow("failed stage");
    expect(failures).toEqual([{ identity: { certificateId: "cert-2", eventId: "event-1", certificateType: "champion", recipientId: "team-1", version: 2 }, attemptId: "attempt-8", message: "failed stage" }]);
  });
  it("does not write outside the artifact path when IDs contain path separators", async () => {
    let filename = "";
    await generateMiracleV3Certificate({ data: { ...v3Data, eventId: "../event", recipientId: "team/one" } }, {
      claimGeneration: async () => ({ status: "claimed", attemptId: "attempt/1" }),
      render: async () => Buffer.from("png"),
      storeArtifact: async artifact => { filename = artifact.filename; return "https://assets.example/cert.png"; },
      recordSuccess: async () => {}, recordFailure: async () => {},
    });
    expect(filename).toBe("certificates/..%2Fevent/champion/team%2Fone/v2/attempt%2F1.png");
  });
});

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
  getLeaderboardForEvent.mockResolvedValue([]);
  countCertificatesForGame.mockResolvedValue(0);
  buildCertificateHtml.mockResolvedValue('<main data-certificate-canvas="1080x1920"></main>');
  findUniqueEvent.mockResolvedValue({
    id: "event-1",
    name: "Miracle Cup",
    slug: "miracle-cup",
    gameId: "game-flashpeak",
    accentColor: "#16a34a",
    characterArtUrl: null,
  });
  findFirstTeam.mockResolvedValue({ id: "team-1", name: "Quantum Vanguard" });
  findFirstCompletion.mockResolvedValue(null);
});

describe("generateCertificate", () => {
  it("rejects direct legacy generation before rendering or persistence for a completed V3 event", async () => {
    findFirstCompletion.mockResolvedValue({ id: "completion-1" });

    await expect(generateCertificate("event-1", "team-1")).rejects.toThrow("Certificate Studio");
    expect(findFirstCompletion).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
      select: { id: true },
    });
    expect(launchCertificateBrowser).not.toHaveBeenCalled();
    expect(recordCertificateSuccess).not.toHaveBeenCalled();
    expect(recordCertificateFailure).not.toHaveBeenCalled();
  });

  it("preserves legacy generation errors when failure recording also fails", async () => {
    const primary = new Error("browser failed first");
    const secondary = new Error("legacy repository unavailable");
    launchCertificateBrowser.mockRejectedValue(primary);
    recordCertificateFailure.mockRejectedValueOnce(secondary);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(generateCertificate("event-1", "team-1")).rejects.toBe(primary);
      expect(log).toHaveBeenCalledWith("Certificate failure persistence failed", expect.objectContaining({ eventId: "event-1", error: secondary }));
    } finally { log.mockRestore(); }
  });
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
