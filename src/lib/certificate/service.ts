import { generateCertificate } from "@/lib/certificate/generate";
import { prisma } from "@/lib/platform/db";
import { getCertificateByEvent } from "@/lib/platform/repository";

export type CertificateNotReadyReason =
  | "final-not-completed"
  | "winner-missing"
  | "winner-not-in-event";

export interface CertificateFinalMatch {
  id: string;
  winnerTeamId: string | null;
}

export interface CertificateWinnerTeam {
  id: string;
  name: string;
  tag: string | null;
}

export interface CertificateRecord {
  imageUrl: string;
}

export interface CertificateGenerationDependencies {
  findCompletedFinal: (
    eventId: string,
  ) => Promise<CertificateFinalMatch | null>;
  findWinnerTeamForEvent: (
    eventId: string,
    winnerTeamId: string,
  ) => Promise<CertificateWinnerTeam | null>;
  findCertificateForEvent: (
    eventId: string,
  ) => Promise<CertificateRecord | null>;
  generateCertificate: (
    eventId: string,
    winnerTeamId: string,
  ) => Promise<string>;
}

export type CertificateGenerationResult =
  | {
      status: "generated";
      imageUrl: string;
      matchId: string;
      winnerTeamId: string;
    }
  | {
      status: "already-exists";
      imageUrl: string;
      matchId: string;
      winnerTeamId: string;
    }
  | {
      status: "not-ready";
      reason: "final-not-completed";
    }
  | {
      status: "not-ready";
      reason: "winner-missing";
      matchId: string;
    }
  | {
      status: "not-ready";
      reason: "winner-not-in-event";
      matchId: string;
      winnerTeamId: string;
    };

const defaultDependencies: CertificateGenerationDependencies = {
  findCompletedFinal: async (eventId) =>
    prisma.match.findFirst({
      where: {
        eventId,
        roundLabel: "Final",
        status: "Completed",
      },
      orderBy: { round: "desc" },
      select: {
        id: true,
        winnerTeamId: true,
      },
    }),
  findWinnerTeamForEvent: async (eventId, winnerTeamId) =>
    prisma.team.findFirst({
      where: {
        id: winnerTeamId,
        eventId,
      },
    }),
  findCertificateForEvent: getCertificateByEvent,
  generateCertificate: async (eventId, winnerTeamId) =>
    generateCertificate(eventId, winnerTeamId),
};

/**
 * Resolve the completed Final winner on the server and generate its certificate.
 * This is the single entry point used by automatic generation and manual retries.
 */
export async function generateCertificateForEvent(
  eventId: string,
  dependencies: CertificateGenerationDependencies = defaultDependencies,
): Promise<CertificateGenerationResult> {
  const finalMatch = await dependencies.findCompletedFinal(eventId);

  if (!finalMatch) {
    return {
      status: "not-ready",
      reason: "final-not-completed",
    };
  }

  const winnerTeamId = finalMatch.winnerTeamId;
  if (!winnerTeamId) {
    return {
      status: "not-ready",
      reason: "winner-missing",
      matchId: finalMatch.id,
    };
  }

  const winnerTeam = await dependencies.findWinnerTeamForEvent(
    eventId,
    winnerTeamId,
  );
  if (!winnerTeam) {
    return {
      status: "not-ready",
      reason: "winner-not-in-event",
      matchId: finalMatch.id,
      winnerTeamId,
    };
  }

  const existingCertificate =
    await dependencies.findCertificateForEvent(eventId);
  if (existingCertificate) {
    return {
      status: "already-exists",
      imageUrl: existingCertificate.imageUrl,
      matchId: finalMatch.id,
      winnerTeamId,
    };
  }

  const imageUrl = await dependencies.generateCertificate(
    eventId,
    winnerTeam.id,
  );
  return {
    status: "generated",
    imageUrl,
    matchId: finalMatch.id,
    winnerTeamId,
  };
}

/**
 * Automatic trigger guard: only a completed Final with a winner may start the
 * event-level service. Manual retries call generateCertificateForEvent directly.
 */
export async function generateCertificateIfFinal(
  matchId: string,
  eventId: string,
): Promise<CertificateGenerationResult> {
  const triggerMatch = await prisma.match.findFirst({
    where: {
      id: matchId,
      eventId,
      roundLabel: "Final",
      status: "Completed",
      winnerTeamId: { not: null },
    },
    select: { id: true },
  });

  if (!triggerMatch) {
    return {
      status: "not-ready",
      reason: "final-not-completed",
    };
  }

  return generateCertificateForEvent(eventId);
}
