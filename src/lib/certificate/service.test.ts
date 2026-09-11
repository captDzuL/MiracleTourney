import { describe, expect, it, vi } from "vitest";

import {
  generateCertificateForEvent,
  type CertificateGenerationDependencies,
} from "@/lib/certificate/service";

function createDependencies(
  overrides: Partial<CertificateGenerationDependencies> = {},
): CertificateGenerationDependencies {
  return {
    findCompletedFinal: vi.fn().mockResolvedValue({
      id: "match-final",
      winnerTeamId: "team-winner",
    }),
    findWinnerTeamForEvent: vi.fn().mockResolvedValue({
      id: "team-winner",
      name: "The Brothers Invictus",
      tag: "TBI",
    }),
    findCertificateForEvent: vi.fn().mockResolvedValue(null),
    generateCertificate: vi.fn().mockResolvedValue("/uploads/certificates/mfl-s2.png"),
    ...overrides,
  };
}

describe("generateCertificateForEvent", () => {
  it("returns not-ready when there is no completed Final", async () => {
    const dependencies = createDependencies({
      findCompletedFinal: vi.fn().mockResolvedValue(null),
    });

    await expect(
      generateCertificateForEvent("event-mfl-s2", dependencies),
    ).resolves.toEqual({
      status: "not-ready",
      reason: "final-not-completed",
    });
    expect(dependencies.generateCertificate).not.toHaveBeenCalled();
  });

  it("returns not-ready when the completed Final has no winner", async () => {
    const dependencies = createDependencies({
      findCompletedFinal: vi.fn().mockResolvedValue({
        id: "match-final",
        winnerTeamId: null,
      }),
    });

    await expect(
      generateCertificateForEvent("event-mfl-s2", dependencies),
    ).resolves.toEqual({
      status: "not-ready",
      reason: "winner-missing",
      matchId: "match-final",
    });
    expect(dependencies.generateCertificate).not.toHaveBeenCalled();
  });

  it("rejects a winner that is not a participant of the event", async () => {
    const findWinnerTeamForEvent = vi.fn().mockResolvedValue(null);
    const dependencies = createDependencies({ findWinnerTeamForEvent });

    await expect(
      generateCertificateForEvent("event-mfl-s2", dependencies),
    ).resolves.toEqual({
      status: "not-ready",
      reason: "winner-not-in-event",
      matchId: "match-final",
      winnerTeamId: "team-winner",
    });
    expect(findWinnerTeamForEvent).toHaveBeenCalledWith(
      "event-mfl-s2",
      "team-winner",
    );
    expect(dependencies.generateCertificate).not.toHaveBeenCalled();
  });

  it("does not overwrite a certificate that already exists", async () => {
    const dependencies = createDependencies({
      findCertificateForEvent: vi.fn().mockResolvedValue({
        imageUrl: "/uploads/certificates/existing.png",
      }),
    });

    await expect(
      generateCertificateForEvent("event-mfl-s2", dependencies),
    ).resolves.toEqual({
      status: "already-exists",
      imageUrl: "/uploads/certificates/existing.png",
      matchId: "match-final",
      winnerTeamId: "team-winner",
    });
    expect(dependencies.generateCertificate).not.toHaveBeenCalled();
  });

  it("generates a certificate for the server-derived Final winner", async () => {
    const generateCertificate = vi.fn().mockResolvedValue("/uploads/certificates/generated.png");
    const dependencies = createDependencies({ generateCertificate });

    await expect(
      generateCertificateForEvent("event-mfl-s2", dependencies),
    ).resolves.toEqual({
      status: "generated",
      imageUrl: "/uploads/certificates/generated.png",
      matchId: "match-final",
      winnerTeamId: "team-winner",
    });
    expect(generateCertificate).toHaveBeenCalledWith("event-mfl-s2", "team-winner");
  });
});
