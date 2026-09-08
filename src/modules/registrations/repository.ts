import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/platform/db";
import type {
  Event,
  PaymentSettings,
  Team,
  TeamRegistrationRequest,
  TeamRegistrationRequestStatus,
} from "@/lib/platform/types";
import type { ActorContext } from "@/modules/identity";

import type { PaymentSettingsInput, RegisterTeamInput } from "./types";

const PAYMENT_SETTINGS_ID = "global";
const PAYMENT_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
const ACTIVE_REQUEST_STATUSES: TeamRegistrationRequestStatus[] = ["pending_payment", "pending_review", "approved"];
const RESERVED_REQUEST_STATUSES: TeamRegistrationRequestStatus[] = ["pending_payment", "pending_review"];
const EXPIRABLE_REQUEST_STATUSES: TeamRegistrationRequestStatus[] = ["pending_payment", "rejected"];

const registrationRequestInclude = {
  event: { include: { stream: true } },
  captain: { select: { id: true, name: true, email: true } },
} as const;

type TransactionClient = Prisma.TransactionClient;
type RegistrationClient = Pick<TransactionClient, "event" | "match" | "paymentSettings" | "player" | "team" | "teamRegistrationRequest">;

type DraftTeam = {
  id: string;
  captainId: string | null;
  eventId: string | null;
  name: string;
  tag: string;
  logoText: string;
  logoUrl: string | null;
  captainName: string | null;
  captainContact: string | null;
  source: string;
  players: Array<{
    displayName: string;
    nickname: string;
    position: string;
    jerseyNumber: number | null;
  }>;
};

function mapTeam(row: {
  id: string;
  eventId: string | null;
  captainId: string | null;
  name: string;
  logoText: string;
  logoUrl?: string | null;
  tag: string;
  captainName?: string | null;
  captainContact?: string | null;
  source: string;
}): Team {
  return {
    id: row.id,
    captainId: row.captainId ?? "",
    ...(row.eventId ? { eventId: row.eventId } : {}),
    name: row.name,
    logoText: row.logoText,
    ...(row.logoUrl ? { logoUrl: row.logoUrl } : {}),
    tag: row.tag,
    ...(row.captainName ? { captainName: row.captainName } : {}),
    ...(row.captainContact ? { captainContact: row.captainContact } : {}),
    source: row.source as Team["source"],
  };
}

function mapEvent(row: Record<string, unknown>): Event {
  return row as Event;
}

function mapRequest(row: {
  id: string;
  eventId: string;
  captainId: string;
  teamId: string | null;
  teamName: string;
  teamTag: string;
  status: string;
  proofImageUrl: string | null;
  rejectReason: string | null;
  expiresAt: Date;
  approvedAt: Date | null;
  approvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  event?: unknown;
  captain?: { id: string; name: string; email?: string } | null;
}): TeamRegistrationRequest {
  return {
    id: row.id,
    eventId: row.eventId,
    captainId: row.captainId,
    ...(row.teamId ? { teamId: row.teamId } : {}),
    teamName: row.teamName,
    teamTag: row.teamTag,
    status: row.status as TeamRegistrationRequestStatus,
    ...(row.proofImageUrl ? { proofImageUrl: row.proofImageUrl } : {}),
    ...(row.rejectReason ? { rejectReason: row.rejectReason } : {}),
    expiresAt: row.expiresAt,
    ...(row.approvedAt ? { approvedAt: row.approvedAt } : {}),
    ...(row.approvedById ? { approvedById: row.approvedById } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.event ? { event: mapEvent(row.event as Record<string, unknown>) } : {}),
    ...(row.captain !== undefined ? { captain: row.captain } : {}),
  };
}

function mapPaymentSettings(row: { id: string; qrisImageUrl: string | null; instructions: string | null; updatedAt?: Date } | null): PaymentSettings {
  if (!row) return { id: PAYMENT_SETTINGS_ID };
  return {
    id: row.id,
    ...(row.qrisImageUrl ? { qrisImageUrl: row.qrisImageUrl } : {}),
    ...(row.instructions ? { instructions: row.instructions } : {}),
    ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
  };
}

function assertReviewAccess(actor: ActorContext, organizerUserId: string | null): void {
  if (actor.role === "platform_admin") return;
  if (actor.role === "organizer" && actor.tenantId && actor.tenantId === organizerUserId) return;
  throw new Error("Not authorized");
}

async function expireStaleRequests(client: RegistrationClient): Promise<void> {
  await client.teamRegistrationRequest.updateMany({
    where: { status: { in: EXPIRABLE_REQUEST_STATUSES }, expiresAt: { lte: new Date() } },
    data: { status: "expired" },
  });
}

async function resolveRegistrationTeam(client: RegistrationClient, input: RegisterTeamInput) {
  let name = input.name?.trim() ?? "";
  let tag = input.tag?.trim().toUpperCase() ?? "";
  let draftTeam: DraftTeam | null = null;

  if (input.draftTeamId) {
    draftTeam = await client.team.findFirst({
      where: { id: input.draftTeamId, captainId: input.captainId, eventId: null, source: "draft" },
      include: { players: { orderBy: { createdAt: "asc" } } },
    }) as DraftTeam | null;
    if (!draftTeam) throw new Error("Draft tim tidak ditemukan untuk akun ini.");
    name = draftTeam.name.trim();
    tag = draftTeam.tag.trim().toUpperCase();
    const invalidRoster = draftTeam.players.some(
      (player) => player.displayName.trim().length < 2 || player.nickname.trim().length < 2,
    );
    if (draftTeam.players.length === 0 || invalidRoster) {
      throw new Error("Lengkapi UID dan IGN roster draft sebelum mendaftar event.");
    }
  }

  if (name.length < 2) throw new Error("Nama tim minimal 2 karakter.");
  if (tag.length < 2 || tag.length > 5) throw new Error("Tag tim harus 2-5 karakter.");
  return { name, tag, draftTeam };
}

async function validateFinalRegistration(
  client: RegistrationClient,
  input: RegisterTeamInput,
  options: { paid: boolean },
) {
  const event = await client.event.findUnique({
    where: { id: input.eventId },
    select: {
      id: true,
      slug: true,
      status: true,
      participantCap: true,
      format: true,
      registrationFeeRequired: true,
      registrationFeeAmount: true,
    },
  });
  if (!event || event.status !== "Published") throw new Error("Event tidak valid atau sudah tidak membuka pendaftaran.");
  if (options.paid && !event.registrationFeeRequired) throw new Error("Event ini tidak membutuhkan verifikasi pembayaran.");
  if (!options.paid && event.registrationFeeRequired) throw new Error("Event ini membutuhkan verifikasi pembayaran sebelum tim aktif.");

  const team = await resolveRegistrationTeam(client, input);
  const [registeredTeams, existingCaptainTeam, existingTeamIdentity, completedMatches] = await Promise.all([
    client.team.count({ where: { eventId: input.eventId } }),
    client.team.findFirst({ where: { eventId: input.eventId, captainId: input.captainId }, select: { id: true } }),
    client.team.findFirst({ where: { eventId: input.eventId, OR: [{ name: team.name }, { tag: team.tag }] }, select: { id: true } }),
    event.format === "Single Elimination"
      ? client.match.count({ where: { eventId: input.eventId, status: "Completed" } })
      : Promise.resolve(0),
  ]);
  if (registeredTeams >= event.participantCap) throw new Error("Slot pendaftaran event ini sudah penuh.");
  if (existingCaptainTeam) throw new Error("Kamu sudah mendaftarkan tim untuk event ini.");
  if (completedMatches > 0) throw new Error(`Event "${event.slug}" sudah memiliki hasil match, jadi pendaftaran tim baru ditutup.`);
  if (existingTeamIdentity) throw new Error("Tag atau nama tim sudah digunakan di event ini.");
  return { event, ...team };
}

function mapDuplicate(error: unknown): never {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : "";
  const message = error instanceof Error ? error.message : "";
  if (code === "P2002" || message.includes("Unique constraint")) {
    throw new Error("Tag atau nama tim sudah digunakan di event ini.");
  }
  throw error;
}

export async function registerTeam(input: RegisterTeamInput): Promise<Team> {
  try {
    return await prisma.$transaction(async (tx) => {
      const { name, tag, draftTeam } = await validateFinalRegistration(tx, input, { paid: false });
      const row = await tx.team.create({
        data: {
          eventId: input.eventId,
          captainId: input.captainId,
          name,
          logoText: draftTeam?.logoText || tag.slice(0, 2),
          ...(draftTeam?.logoUrl ? { logoUrl: draftTeam.logoUrl } : {}),
          tag,
          ...(draftTeam?.captainName ? { captainName: draftTeam.captainName } : {}),
          ...(draftTeam?.captainContact ? { captainContact: draftTeam.captainContact } : {}),
          source: "registration",
        },
      });
      if (draftTeam) {
        await tx.player.createMany({
          data: draftTeam.players.map((player) => ({
            teamId: row.id,
            eventId: input.eventId,
            displayName: player.displayName.trim(),
            nickname: player.nickname.trim(),
            position: player.position?.trim() ?? "",
            jerseyNumber: player.jerseyNumber,
          })),
        });
      }
      return mapTeam(row);
    });
  } catch (error) {
    return mapDuplicate(error);
  }
}

export async function createTeamRegistrationRequest(input: RegisterTeamInput): Promise<TeamRegistrationRequest> {
  try {
    return await prisma.$transaction(async (tx) => {
      await expireStaleRequests(tx);
      const { name, tag, draftTeam } = await validateFinalRegistration(tx, input, { paid: true });
      const [existingCaptainRequest, existingRequestIdentity] = await Promise.all([
        tx.teamRegistrationRequest.findFirst({
          where: { eventId: input.eventId, captainId: input.captainId, status: { in: ACTIVE_REQUEST_STATUSES } },
          select: { id: true },
        }),
        tx.teamRegistrationRequest.findFirst({
          where: { eventId: input.eventId, status: { in: RESERVED_REQUEST_STATUSES }, OR: [{ teamName: name }, { teamTag: tag }] },
          select: { id: true },
        }),
      ]);
      if (existingCaptainRequest) throw new Error("Kamu sudah mendaftarkan tim untuk event ini.");
      if (existingRequestIdentity) throw new Error("Tag atau nama tim sudah digunakan di event ini.");

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
      return mapRequest(row);
    });
  } catch (error) {
    return mapDuplicate(error);
  }
}

export async function assertCaptainCanUploadPaymentProof(actor: ActorContext, requestId: string): Promise<void> {
  if (actor.role !== "captain") throw new Error("Pendaftaran pembayaran tidak ditemukan.");
  const request = await prisma.teamRegistrationRequest.findFirst({
    where: { id: requestId, captainId: actor.userId },
    select: { id: true, status: true, expiresAt: true },
  });
  validateMutableProofRequest(request);
}

function validateMutableProofRequest(request: { id: string; status: string; expiresAt: Date } | null): void {
  if (!request) throw new Error("Pendaftaran pembayaran tidak ditemukan.");
  if (!["pending_payment", "rejected"].includes(request.status)) {
    throw new Error("Bukti pembayaran untuk pendaftaran ini tidak bisa diubah.");
  }
  if (request.expiresAt <= new Date()) throw new Error("Pendaftaran pembayaran sudah kedaluwarsa.");
}

export async function updateTeamRegistrationProof(actor: ActorContext, requestId: string, proofImageUrl: string): Promise<TeamRegistrationRequest> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.teamRegistrationRequest.findFirst({
      where: { id: requestId, captainId: actor.role === "captain" ? actor.userId : "" },
      include: registrationRequestInclude,
    });
    try {
      validateMutableProofRequest(request);
    } catch (error) {
      if (request && request.expiresAt <= new Date()) {
        await tx.teamRegistrationRequest.update({ where: { id: request.id }, data: { status: "expired" } });
      }
      throw error;
    }
    const row = await tx.teamRegistrationRequest.update({
      where: { id: request!.id },
      data: { proofImageUrl, rejectReason: null, status: "pending_review" },
      include: registrationRequestInclude,
    });
    return mapRequest(row);
  });
}

export async function getCaptainRegistrationRequests(captainId: string): Promise<TeamRegistrationRequest[]> {
  if (!captainId) return [];
  await expireStaleRequests(prisma);
  const rows = await prisma.teamRegistrationRequest.findMany({
    where: { captainId, status: { in: ["pending_payment", "pending_review", "rejected", "expired"] } },
    include: registrationRequestInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapRequest);
}

export async function getPaymentRegistrationRequestsForAdmin(
  actor: ActorContext,
  filters: { eventId?: string; status?: TeamRegistrationRequestStatus } = {},
): Promise<TeamRegistrationRequest[]> {
  if (actor.role !== "organizer" && actor.role !== "platform_admin") throw new Error("Not authorized");
  await expireStaleRequests(prisma);
  const where: Prisma.TeamRegistrationRequestWhereInput = {};
  if (filters.eventId) where.eventId = filters.eventId;
  if (filters.status) where.status = filters.status;
  if (actor.role === "organizer") where.event = { organizerUserId: actor.tenantId ?? "" };
  const rows = await prisma.teamRegistrationRequest.findMany({
    where,
    include: registrationRequestInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapRequest);
}

export async function approveTeamRegistrationRequest(actor: ActorContext, requestId: string): Promise<Team> {
  try {
    return await prisma.$transaction(async (tx) => {
      const request = await tx.teamRegistrationRequest.findFirst({ where: { id: requestId }, include: registrationRequestInclude });
      if (!request) throw new Error("Pendaftaran pembayaran tidak ditemukan.");
      assertReviewAccess(actor, request.event.organizerUserId);
      if (request.status !== "pending_review") throw new Error("Pendaftaran belum siap diverifikasi.");
      if (request.event.status !== "Published") throw new Error("Event tidak valid atau sudah tidak membuka pendaftaran.");
      const [registeredTeams, existingCaptainTeam, existingTeamIdentity, completedMatches] = await Promise.all([
        tx.team.count({ where: { eventId: request.eventId } }),
        tx.team.findFirst({
          where: { eventId: request.eventId, captainId: request.captainId, ...(request.teamId ? { id: { not: request.teamId } } : {}) },
          select: { id: true },
        }),
        tx.team.findFirst({
          where: {
            eventId: request.eventId,
            ...(request.teamId ? { id: { not: request.teamId } } : {}),
            OR: [{ name: request.teamName }, { tag: request.teamTag }],
          },
          select: { id: true },
        }),
        request.event.format === "Single Elimination"
          ? tx.match.count({ where: { eventId: request.eventId, status: "Completed" } })
          : Promise.resolve(0),
      ]);
      if (registeredTeams >= request.event.participantCap) throw new Error("Slot pendaftaran event ini sudah penuh.");
      if (existingCaptainTeam) throw new Error("Kamu sudah mendaftarkan tim untuk event ini.");
      if (completedMatches > 0) throw new Error(`Event "${request.event.slug}" sudah memiliki hasil match, jadi pendaftaran tim baru ditutup.`);
      if (existingTeamIdentity) throw new Error("Tag atau nama tim sudah digunakan di event ini.");

      if (request.teamId) {
        const linkedTeam = await tx.team.findUnique({
          where: { id: request.teamId },
          select: { id: true, captainId: true, eventId: true, source: true },
        });
        if (!linkedTeam || linkedTeam.captainId !== request.captainId || ![null, request.eventId].includes(linkedTeam.eventId)) {
          throw new Error("Tim terkait tidak cocok dengan pendaftaran pembayaran.");
        }
      }

      const team = request.teamId
        ? await tx.team.update({ where: { id: request.teamId }, data: { eventId: request.eventId, source: "registration" } })
        : await tx.team.create({
            data: {
              eventId: request.eventId,
              captainId: request.captainId,
              name: request.teamName,
              logoText: request.teamTag.slice(0, 2),
              tag: request.teamTag,
              source: "registration",
            },
          });
      await tx.player.updateMany({ where: { teamId: team.id }, data: { eventId: request.eventId } });
      await tx.teamRegistrationRequest.update({
        where: { id: request.id },
        data: { status: "approved", teamId: team.id, approvedAt: new Date(), approvedById: actor.userId },
        include: registrationRequestInclude,
      });
      return mapTeam(team);
    });
  } catch (error) {
    return mapDuplicate(error);
  }
}

export async function rejectTeamRegistrationRequest(actor: ActorContext, requestId: string, reason: string): Promise<TeamRegistrationRequest> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.teamRegistrationRequest.findFirst({ where: { id: requestId }, include: registrationRequestInclude });
    if (!request) throw new Error("Pendaftaran pembayaran tidak ditemukan.");
    assertReviewAccess(actor, request.event.organizerUserId);
    if (!["pending_review", "pending_payment"].includes(request.status)) throw new Error("Pendaftaran ini tidak bisa ditolak.");
    const row = await tx.teamRegistrationRequest.update({
      where: { id: request.id },
      data: { status: "rejected", rejectReason: reason, proofImageUrl: null },
      include: registrationRequestInclude,
    });
    return mapRequest(row);
  });
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  return mapPaymentSettings(await prisma.paymentSettings.findUnique({ where: { id: PAYMENT_SETTINGS_ID } }));
}

export async function updatePaymentSettings(actor: ActorContext, input: PaymentSettingsInput): Promise<PaymentSettings> {
  if (actor.role !== "platform_admin") throw new Error("Not authorized");
  return prisma.$transaction(async (tx) => {
    const data = { qrisImageUrl: input.qrisImageUrl ?? null, instructions: input.instructions ?? null };
    const row = await tx.paymentSettings.upsert({
      where: { id: PAYMENT_SETTINGS_ID },
      update: data,
      create: { id: PAYMENT_SETTINGS_ID, ...data },
    });
    return mapPaymentSettings(row);
  });
}

export async function createOrUpdateCaptainDraftTeam(input: {
  captainId: string;
  captainName: string;
  name: string;
  tag: string;
}): Promise<Team> {
  const tag = input.tag.trim().toUpperCase();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.team.findFirst({
      where: { captainId: input.captainId, eventId: null, source: "draft" },
      select: { id: true },
    });
    const data = {
      eventId: null,
      captainId: input.captainId,
      captainName: input.captainName,
      name: input.name.trim(),
      logoText: tag.slice(0, 2),
      tag,
      source: "draft",
    };
    const row = existing
      ? await tx.team.update({ where: { id: existing.id }, data })
      : await tx.team.create({ data });
    return mapTeam(row);
  });
}