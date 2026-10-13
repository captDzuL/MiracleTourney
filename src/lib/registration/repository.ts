// Registration: registerTeam, registration requests, captain drafts, payment proof and roster-change window.
// Moved out of platform/repository.ts without changes (refactor PR 2.7).

import { getGameModeConfig } from "@/lib/platform/config";
import { prisma } from "@/lib/platform/db";
import { graphFromPhaseConfiguration, resolveRosterChangeWindow } from "@/lib/platform/roster-change-window";
import type { RosterChangeWindow } from "@/lib/platform/roster-change-window";
import { ACTIVE_REGISTRATION_REQUEST_STATUSES, PAYMENT_REQUEST_TTL_MS, RESERVED_REGISTRATION_REQUEST_STATUSES, ROSTER_LOCKED_MESSAGE } from "@/lib/platform/shared/constants";
import { mapTeam, mapTeamRegistrationRequest, registrationRequestInclude } from "@/lib/platform/shared/mappers";
import { assertEventRosterMutable, assertNewRegistrationWindowOpen, expireStaleRegistrationRequests, readEventRosterLocked, runSerializableRegistrationTransaction } from "@/lib/platform/shared/tx";
import type { RosterLockReader } from "@/lib/platform/shared/tx";
import type { AppUser, Team, TeamRegistrationRequest, TeamRegistrationRequestStatus } from "@/lib/platform/types";
import { UserFacingError } from "@/lib/security/public-error";
import type { CompetitionGraph } from "@/lib/tournament/competition/types";
import { Prisma } from "@prisma/client";

export class RegistrationMutationConflictError extends Error {
  readonly code = "stale_mutation" as const;
  readonly currentUpdatedAt?: Date;

  constructor(message = "Pendaftaran berubah. Muat ulang sebelum mencoba lagi.", currentUpdatedAt?: Date) {
    super(message);
    this.name = "RegistrationMutationConflictError";
    this.currentUpdatedAt = currentUpdatedAt;
  }
}

export type RegistrationReviewPrecondition = {
  expectedStatus?: TeamRegistrationRequestStatus;
  expectedUpdatedAt?: Date;
};

export function generateSyntheticRegistrationEmail(eventSlug: string, tag: string, usedInBatch: Set<string>): string {
  const base = `${eventSlug}-${tag}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let candidate = `${base}@miraclefc.gg`;
  let n = 2;
  while (usedInBatch.has(candidate)) {
    candidate = `${base}-${n}@miraclefc.gg`;
    n += 1;
  }
  usedInBatch.add(candidate);
  return candidate;
}

export type RosterChangeWindowReader = RosterLockReader;

/**
 * Which roster rule applies right now. `free` and `locked` match the existing
 * all-or-nothing lock; `limited` means the organizer allowed approved roster
 * changes and the group stage is still running. A missing or unreadable
 * competition graph resolves to `locked`.
 */
export async function readRosterChangeState(
  db: RosterChangeWindowReader,
  eventId: string,
): Promise<{ window: RosterChangeWindow; graph: CompetitionGraph | null }> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { status: true, rosterChangeLimit: true } });
  if (!event) return { window: "free", graph: null };
  const baseLocked = await readEventRosterLocked(db, eventId);
  if (!baseLocked) return { window: "free", graph: null };
  if (event.rosterChangeLimit <= 0) return { window: "locked", graph: null };

  const [firstPhase, matches] = await Promise.all([
    db.competitionPhase.findFirst({ where: { eventId, sequence: 1 }, select: { configuration: true } }),
    db.match.findMany({ where: { eventId } }),
  ]);
  const graph = graphFromPhaseConfiguration(firstPhase?.configuration, eventId);
  const window = resolveRosterChangeWindow({
    baseLocked,
    eventStatus: event.status,
    rosterChangeLimit: event.rosterChangeLimit,
    graph,
    matches,
  });
  return { window, graph };
}

export async function readRosterChangeWindow(db: RosterChangeWindowReader, eventId: string): Promise<RosterChangeWindow> {
  return (await readRosterChangeState(db, eventId)).window;
}

export async function getRosterChangeWindow(eventId: string): Promise<RosterChangeWindow> {
  return readRosterChangeWindow(prisma, eventId);
}

export type CaptainRegistrationDraft = {
  id: string;
  name: string;
  tag: string;
  logoText: string;
  logoUrl: string | null;
  captainName: string | null;
  captainContact: string | null;
  captainIgn: string | null;
  captainUid: string | null;
  captainIsPlayer: boolean;
  players: Array<{
    displayName: string;
    nickname: string;
    position: string;
    jerseyNumber: number | null;
  }>;
};

export async function resolveCaptainRegistrationTeam(
  input: {
    captainId: string;
    name?: string;
    tag?: string;
    draftTeamId?: string;
  },
  db: Pick<Prisma.TransactionClient, "team"> = prisma,
): Promise<{ name: string; tag: string; draftTeam: CaptainRegistrationDraft | null }> {
  let name = input.name?.trim() ?? "";
  let tag = input.tag?.trim().toUpperCase() ?? "";
  let draftTeam: CaptainRegistrationDraft | null = null;

  if (input.draftTeamId) {
    draftTeam = await db.team.findFirst({
      where: { id: input.draftTeamId, captainId: input.captainId, eventId: null, source: "draft" },
      include: { players: { orderBy: { createdAt: "asc" } } },
    });
    if (!draftTeam) {
      throw new UserFacingError("Draft tim tidak ditemukan untuk akun ini.");
    }

    name = draftTeam.name.trim();
    tag = draftTeam.tag.trim().toUpperCase();
    const hasInvalidRoster = draftTeam.players.some(
      (player) => player.displayName.trim().length < 2 || player.nickname.trim().length < 2,
    );
    if (draftTeam.players.length === 0 || hasInvalidRoster) {
      throw new UserFacingError("Lengkapi UID dan IGN roster draft sebelum mendaftar event.");
    }
  }

  if (name.length < 2) {
    throw new UserFacingError("Nama tim minimal 2 karakter.");
  }
  if (tag.length < 2 || tag.length > 5) {
    throw new UserFacingError("Tag tim harus 2-5 karakter.");
  }

  return { name, tag, draftTeam };
}

export function copyDraftPlayersForEvent(draftTeam: CaptainRegistrationDraft, teamId: string, eventId: string) {
  return draftTeam.players.map((player) => ({
    teamId,
    eventId,
    displayName: player.displayName.trim(),
    nickname: player.nickname.trim(),
    position: player.position?.trim() ?? "",
    jerseyNumber: player.jerseyNumber,
  }));
}

export function assertDraftRosterFitsGameMode(
  draftTeam: CaptainRegistrationDraft | null,
  gameModeId: string,
): void {
  if (!draftTeam) return;
  const maximumRoster = getGameModeConfig(gameModeId).maxRosterSize;
  if (draftTeam.players.length > maximumRoster) {
    throw new UserFacingError(`Roster tim maksimal ${maximumRoster} pemain untuk mode pertandingan ini.`);
  }
}

/** Registers one team for an existing captain while the event is still open. */
export async function registerTeam(input: {
  eventId: string;
  captainId: string;
  name?: string;
  tag?: string;
  draftTeamId?: string;
}): Promise<Team> {
  const { name, tag, draftTeam } = await resolveCaptainRegistrationTeam(input);

  try {
    return await runSerializableRegistrationTransaction(async (tx) => {
      await assertEventRosterMutable(tx, input.eventId);
      const event = await tx.event.findUnique({
        where: { id: input.eventId },
        select: {
          id: true,
          slug: true,
          status: true,
          participantCap: true,
          format: true,
          registrationFeeRequired: true,
          gameModeId: true,
          registrationOpensAt: true,
          registrationClosesAt: true,
        },
      });
      if (!event) throw new UserFacingError("Event tidak valid atau sudah tidak membuka pendaftaran.");
      assertNewRegistrationWindowOpen(event);
      assertDraftRosterFitsGameMode(draftTeam, event.gameModeId);
      if (event.registrationFeeRequired) {
        throw new UserFacingError("Event ini membutuhkan verifikasi pembayaran sebelum tim aktif.");
      }

      const [registeredTeams, pendingReviewRequests, existingCaptainTeam, completedMatches] = await Promise.all([
        tx.team.count({ where: { eventId: input.eventId } }),
        tx.teamRegistrationRequest.count({ where: { eventId: input.eventId, status: "pending_review" } }),
        tx.team.findFirst({
          where: { eventId: input.eventId, captainId: input.captainId },
          select: { id: true },
        }),
        event.format === "Single Elimination"
          ? tx.match.count({ where: { eventId: input.eventId, status: "Completed" } })
          : Promise.resolve(0),
      ]);

      if (registeredTeams + pendingReviewRequests >= event.participantCap) {
        throw new UserFacingError("Slot pendaftaran event ini sudah penuh.");
      }
      if (existingCaptainTeam) {
        throw new UserFacingError("Kamu sudah mendaftarkan tim untuk event ini.");
      }
      if (completedMatches > 0) {
        throw new UserFacingError(`Event "${event.slug}" sudah memiliki hasil match, jadi pendaftaran tim baru ditutup.`);
      }

      if (draftTeam) {
        const row = await tx.team.create({
          data: {
            eventId: input.eventId,
            captainId: input.captainId,
            name,
            logoText: draftTeam.logoText || tag.slice(0, 2),
            logoUrl: draftTeam.logoUrl,
            tag,
            captainIgn: draftTeam.captainIgn,
            captainUid: draftTeam.captainUid,
            captainIsPlayer: draftTeam.captainIsPlayer,
            captainName: draftTeam.captainName,
            captainContact: draftTeam.captainContact,
            source: "registration",
          },
        });
        await tx.player.createMany({ data: copyDraftPlayersForEvent(draftTeam, row.id, input.eventId) });
        return mapTeam(row);
      }

      const row = await tx.team.create({
        data: {
          eventId: input.eventId,
          captainId: input.captainId,
          name,
          logoText: tag.slice(0, 2),
          tag,
          source: "registration",
        },
      });
      return mapTeam(row);
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : "";
    const message = error instanceof Error ? error.message : "";
    if (code === "P2002" || message.includes("Unique constraint")) {
      throw new UserFacingError("Tag atau nama tim sudah digunakan di event ini.");
    }
    throw error;
  }
}

export async function createTeamRegistrationRequest(input: {
  eventId: string;
  captainId: string;
  name?: string;
  tag?: string;
  draftTeamId?: string;
}): Promise<TeamRegistrationRequest> {
  await expireStaleRegistrationRequests();

  try {
    // Capacity, duplicate and identity checks share one Serializable transaction with the insert, so two
    // captains cannot both pass the checks for the last slot or the same team name.
    return await runSerializableRegistrationTransaction(async (tx) => {
      const event = await tx.event.findUnique({
        where: { id: input.eventId },
        select: {
          id: true,
          slug: true,
          status: true,
          participantCap: true,
          format: true,
          registrationFeeRequired: true,
          gameModeId: true,
          registrationOpensAt: true,
          registrationClosesAt: true,
        },
      });
      if (!event) throw new UserFacingError("Event tidak valid atau sudah tidak membuka pendaftaran.");
      assertNewRegistrationWindowOpen(event);
      if (!event.registrationFeeRequired) {
        throw new UserFacingError("Event ini tidak membutuhkan verifikasi pembayaran.");
      }
      // A pending request does not change the roster, so only read the lock. Claiming competitionVersion here
      // would make a concurrent drawing publish fail. Approval claims it later, when the team is created.
      if (await readEventRosterLocked(tx, input.eventId)) throw new UserFacingError(ROSTER_LOCKED_MESSAGE);

      const { name, tag, draftTeam } = await resolveCaptainRegistrationTeam(input, tx);
      assertDraftRosterFitsGameMode(draftTeam, event.gameModeId);
      const [registeredTeams, pendingReviewRequests, existingCaptainTeam, existingCaptainRequest, existingTeamIdentity, existingRequestIdentity, completedMatches] = await Promise.all([
        tx.team.count({ where: { eventId: input.eventId } }),
        tx.teamRegistrationRequest.count({ where: { eventId: input.eventId, status: "pending_review" } }),
        tx.team.findFirst({ where: { eventId: input.eventId, captainId: input.captainId }, select: { id: true } }),
        tx.teamRegistrationRequest.findFirst({
          where: { eventId: input.eventId, captainId: input.captainId, status: { in: ACTIVE_REGISTRATION_REQUEST_STATUSES } },
          select: { id: true },
        }),
        tx.team.findFirst({
          where: { eventId: input.eventId, OR: [{ name }, { tag }] },
          select: { id: true },
        }),
        tx.teamRegistrationRequest.findFirst({
          where: { eventId: input.eventId, status: { in: RESERVED_REGISTRATION_REQUEST_STATUSES }, OR: [{ teamName: name }, { teamTag: tag }] },
          select: { id: true },
        }),
        event.format === "Single Elimination" ? tx.match.count({ where: { eventId: input.eventId, status: "Completed" } }) : Promise.resolve(0),
      ]);

      if (registeredTeams + (pendingReviewRequests ?? 0) >= event.participantCap) {
        throw new UserFacingError("Slot pendaftaran event ini sudah penuh.");
      }
      if (existingCaptainTeam || existingCaptainRequest) {
        throw new UserFacingError("Kamu sudah mendaftarkan tim untuk event ini.");
      }
      if (completedMatches > 0) {
        throw new UserFacingError(`Event "${event.slug}" sudah memiliki hasil match, jadi pendaftaran tim baru ditutup.`);
      }
      if (existingTeamIdentity || existingRequestIdentity) {
        throw new UserFacingError("Tag atau nama tim sudah digunakan di event ini.");
      }

      let pendingTeamId: string | undefined;
      if (draftTeam) {
        const pendingTeam = await tx.team.create({
          data: {
            eventId: null,
            captainId: input.captainId,
            name,
            logoText: draftTeam.logoText || tag.slice(0, 2),
            logoUrl: draftTeam.logoUrl,
            tag,
            captainIgn: draftTeam.captainIgn,
            captainUid: draftTeam.captainUid,
            captainIsPlayer: draftTeam.captainIsPlayer,
            captainName: draftTeam.captainName,
            captainContact: draftTeam.captainContact,
            source: "registration-intake",
          },
        });
        pendingTeamId = pendingTeam.id;
        await tx.player.createMany({
          data: draftTeam.players.map((player) => ({
            teamId: pendingTeam.id,
            displayName: player.displayName.trim(),
            nickname: player.nickname.trim(),
            position: player.position?.trim() ?? "",
            jerseyNumber: player.jerseyNumber,
          })),
        });
      }

      const row = await tx.teamRegistrationRequest.create({
        data: {
          eventId: input.eventId,
          captainId: input.captainId,
          ...(pendingTeamId ? { teamId: pendingTeamId } : {}),
          teamName: name,
          teamTag: tag,
          status: "pending_payment",
          expiresAt: new Date(Date.now() + PAYMENT_REQUEST_TTL_MS),
        },
        include: registrationRequestInclude,
      });
      return mapTeamRegistrationRequest(row);
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : "";
    const message = error instanceof Error ? error.message : "";
    if (code === "P2002" || message.includes("Unique constraint")) {
      throw new UserFacingError("Tag atau nama tim sudah digunakan di event ini.");
    }
    throw error;
  }
}

/**
 * Creates or updates the captain's reusable draft team outside any event.
 * Looking for the draft and writing it happen in one Serializable transaction, so two requests that arrive together
 * cannot both decide there is no draft yet and create two.
 */
export async function createOrUpdateCaptainDraftTeam(input: {
  captainId: string;
  captainName: string;
  name: string;
  tag: string;
}): Promise<Team> {
  const name = input.name.trim();
  const tag = input.tag.trim().toUpperCase();
  if (!name || !tag) throw new UserFacingError("Nama dan tag tim wajib diisi.");

  const data = {
    eventId: null,
    captainId: input.captainId,
    captainName: input.captainName.trim(),
    name,
    logoText: tag.slice(0, 2),
    tag,
    source: "draft",
  };

  const row = await runSerializableRegistrationTransaction(async (tx) => {
    const existing = await tx.team.findFirst({
      where: { captainId: input.captainId, eventId: null, source: "draft" },
      select: { id: true },
    });
    return existing
      ? tx.team.update({ where: { id: existing.id }, data })
      : tx.team.create({ data });
  });

  return mapTeam(row);
}

export async function updateTeamRegistrationProof(
  captainId: string,
  requestId: string,
  proofImageUrl: string,
): Promise<TeamRegistrationRequest> {
  const result = await runSerializableRegistrationTransaction(async (tx) => {
    const request = await tx.teamRegistrationRequest.findFirst({
      where: { id: requestId, captainId },
      include: registrationRequestInclude,
    });
    if (!request) throw new Error("Pendaftaran pembayaran tidak ditemukan.");
    if (!["pending_payment", "rejected"].includes(request.status)) {
      throw new Error("Bukti pembayaran untuk pendaftaran ini tidak bisa diubah.");
    }

    const now = new Date();
    if (request.expiresAt <= now) {
      await tx.teamRegistrationRequest.update({
        where: { id: request.id },
        data: { status: "expired" },
      });
      return { kind: "expired" as const };
    }
    if (!["Published", "Registration Closed"].includes(request.event.status)) {
      throw new Error("Event sudah dimulai sehingga bukti pembayaran tidak bisa diterima.");
    }

    const [activeTeamCount, pendingReviewCount] = await Promise.all([
      tx.team.count({ where: { eventId: request.eventId } }),
      tx.teamRegistrationRequest.count({
        where: { eventId: request.eventId, status: "pending_review" },
      }),
    ]);
    if (activeTeamCount + pendingReviewCount >= request.event.participantCap) {
      throw new Error(
        "Slot pendaftaran event ini sudah penuh. Bukti belum diterima; hubungi organizer untuk bantuan.",
      );
    }

    const row = await tx.teamRegistrationRequest.update({
      where: { id: request.id },
      data: { proofImageUrl, rejectReason: null, status: "pending_review" },
      include: registrationRequestInclude,
    });
    return { kind: "updated" as const, row };
  });

  if (result.kind === "expired") {
    throw new Error("Pendaftaran pembayaran sudah kedaluwarsa.");
  }
  return mapTeamRegistrationRequest(result.row);
}

export async function getCaptainRegistrationRequests(captainId: string): Promise<TeamRegistrationRequest[]> {
  if (!captainId) return [];
  await expireStaleRegistrationRequests();
  const rows = await prisma.teamRegistrationRequest.findMany({
    where: { captainId, status: { in: ["pending_payment", "pending_review", "rejected", "expired"] } },
    include: registrationRequestInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapTeamRegistrationRequest);
}

export async function getPaymentRegistrationRequestsForAdmin(user: AppUser, filters: { eventId?: string; status?: TeamRegistrationRequestStatus } = {}): Promise<TeamRegistrationRequest[]> {
  // Check who is asking before anything is written: the expiry cleanup below updates rows.
  if (user.role !== "organizer" && user.role !== "platform_admin" && user.role !== "admin") throw new Error("Not authorized");
  await expireStaleRegistrationRequests();
  const where: Prisma.TeamRegistrationRequestWhereInput = {};
  if (filters.eventId) where.eventId = filters.eventId;
  if (filters.status) where.status = filters.status;
  if (user.role === "organizer") where.event = { organizerUserId: user.id };

  const rows = await prisma.teamRegistrationRequest.findMany({
    where,
    include: registrationRequestInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapTeamRegistrationRequest);
}

/** The captain's own registration request, or null when it does not exist or belongs to another captain. */
export async function findCaptainRegistrationRequestRef(requestId: string, captainId: string): Promise<{ id: string; eventId: string } | null> {
  return prisma.teamRegistrationRequest.findFirst({
    where: { id: requestId, captainId },
    select: { id: true, eventId: true },
  });
}
