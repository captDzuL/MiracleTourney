import { Prisma, type SoloRegistration as SoloRegistrationRow } from "@prisma/client";

import { getGameModeConfig, getSoloDrawRules } from "@/lib/platform/config";
import { prisma } from "@/lib/platform/db";
import {
  PAYMENT_REQUEST_TTL_MS,
  assertNewRegistrationWindowOpen,
  assertUserCanManageEvent,
} from "@/lib/platform/repository";
import type { AppUser } from "@/lib/platform/types";
import { UserFacingError } from "@/lib/security/public-error";

import { resolvePositions } from "./positions";
import {
  EXPIRABLE_STATUSES,
  SLOT_HOLDING_STATUSES,
  SOLO_SLOT_GROUPS,
  type PromotedRegistration,
  type SoloQuotaSnapshot,
  type SoloRegistrationOutcome,
  type SoloRegistrationStatus,
  type SoloRegistrationView,
} from "./registration-types";
import { computeQuota, decideRegistration, slotGroupOf } from "./slots";
import type { SoloRules, SoloSlotGroup } from "./types";

type Tx = Prisma.TransactionClient;

type SoloEvent = Readonly<{
  id: string;
  slug: string;
  name: string;
  status: string;
  registrationFeeRequired: boolean;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  rules: SoloRules;
  quota: Readonly<Record<SoloSlotGroup, number>>;
  positions: readonly string[];
}>;

const MIN_REJECT_REASON = 3;
const MAX_REJECT_REASON = 240;
const STALE_MESSAGE = "Data sudah berubah. Muat ulang halaman.";

const addMs = (date: Date, ms: number) => new Date(date.getTime() + ms);

/**
 * Runs `run` while holding the event's row. Every write that changes who holds a slot goes through
 * here, so registrations for one event take turns instead of racing: each one counts the slots
 * after the previous one has committed. Serializable transactions would also stay correct, but under
 * a burst of sign-ups they fail each other and players would see random "try again" errors.
 */
async function withEventLock<T>(eventId: string, run: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      const locked = await tx.event.updateMany({ where: { id: eventId }, data: { updatedAt: new Date() } });
      if (locked.count !== 1) throw new UserFacingError("Event tidak ditemukan.");
      return run(tx);
    },
    { maxWait: 15_000, timeout: 30_000 },
  );
}

function toView(row: SoloRegistrationRow): SoloRegistrationView {
  return {
    id: row.id,
    eventId: row.eventId,
    userId: row.userId,
    ign: row.ign,
    uid: row.uid,
    primaryPosition: row.primaryPosition,
    secondaryPosition: row.secondaryPosition,
    slotGroup: row.slotGroup as SoloSlotGroup,
    willingCaptain: row.willingCaptain,
    status: row.status as SoloRegistrationStatus,
    proofImageUrl: row.proofImageUrl,
    rejectReason: row.rejectReason,
    slotHeldAt: row.slotHeldAt,
    expiresAt: row.expiresAt,
    approvedAt: row.approvedAt,
    withdrawnAt: row.withdrawnAt,
    refundedAt: row.refundedAt,
    refundNote: row.refundNote,
    version: row.version,
    createdAt: row.createdAt,
  };
}

async function loadSoloEvent(tx: Tx | typeof prisma, eventId: string): Promise<SoloEvent> {
  const event = await tx.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, slug: true, name: true, status: true, entryMode: true, participantCap: true, gameModeId: true,
      registrationFeeRequired: true, registrationOpensAt: true, registrationClosesAt: true,
    },
  });
  if (!event) throw new UserFacingError("Event tidak ditemukan.");
  if (event.entryMode !== "solo") throw new UserFacingError("Event ini bukan event solo.");
  const rules = getSoloDrawRules(event.gameModeId);
  if (!rules) throw new UserFacingError("Game ini belum mendukung event solo.");
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    status: event.status,
    registrationFeeRequired: event.registrationFeeRequired,
    registrationOpensAt: event.registrationOpensAt,
    registrationClosesAt: event.registrationClosesAt,
    rules,
    quota: computeQuota(event.participantCap, rules),
    positions: getGameModeConfig(event.gameModeId).positions,
  };
}

/** Registrations that hold a slot right now: a rejected or unpaid one only until its deadline passes. */
function heldWhere(eventId: string, group: SoloSlotGroup, now: Date): Prisma.SoloRegistrationWhereInput {
  return {
    eventId,
    slotGroup: group,
    OR: [
      { status: { in: ["approved", "pending_review"] } },
      { status: { in: ["pending_payment", "rejected"] }, expiresAt: { gt: now } },
    ],
  };
}

function toPromoted(row: SoloRegistrationRow): PromotedRegistration {
  return {
    registrationId: row.id,
    eventId: row.eventId,
    userId: row.userId,
    status: row.status as PromotedRegistration["status"],
    expiresAt: row.expiresAt,
  };
}

/** Gives free slots to the oldest queued players of each group. Only while the event still takes registrations. */
async function promoteQueued(tx: Tx, event: SoloEvent, now: Date): Promise<PromotedRegistration[]> {
  if (event.status !== "Published") return [];
  const promoted: PromotedRegistration[] = [];
  for (const group of SOLO_SLOT_GROUPS) {
    const held = await tx.soloRegistration.count({ where: heldWhere(event.id, group, now) });
    const free = event.quota[group] - held;
    if (free <= 0) continue;
    const next = await tx.soloRegistration.findMany({
      where: { eventId: event.id, slotGroup: group, status: "queued" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: free,
    });
    for (const row of next) {
      const status = event.registrationFeeRequired ? "pending_payment" : "approved";
      const updated = await tx.soloRegistration.update({
        where: { id: row.id },
        data: {
          status,
          slotHeldAt: now,
          expiresAt: status === "pending_payment" ? addMs(now, PAYMENT_REQUEST_TTL_MS) : null,
          approvedAt: status === "approved" ? now : null,
          version: { increment: 1 },
        },
      });
      promoted.push(toPromoted(updated));
    }
  }
  return promoted;
}

/** Expires registrations past their deadline, then lets queued players take the slots that opened. */
async function sweep(tx: Tx, event: SoloEvent, now: Date): Promise<{ expired: number; promoted: PromotedRegistration[] }> {
  const expired = await tx.soloRegistration.updateMany({
    where: { eventId: event.id, status: { in: [...EXPIRABLE_STATUSES] }, expiresAt: { lte: now } },
    data: { status: "expired", version: { increment: 1 } },
  });
  return { expired: expired.count, promoted: await promoteQueued(tx, event, now) };
}

/** Runs the expiry and queue promotion for one solo event. Safe to call as often as needed. */
export async function sweepSoloEvent(eventId: string): Promise<{ expired: number; promoted: PromotedRegistration[] }> {
  return withEventLock(eventId, async (tx) => sweep(tx, await loadSoloEvent(tx, eventId), new Date()));
}

export type RegisterSoloInput = Readonly<{
  eventId: string;
  userId: string;
  ign: string;
  uid: string;
  primaryPosition: string;
  secondaryPosition?: string | null;
  willingCaptain: boolean;
  whatsapp: string;
}>;

export type RegisterSoloResult = Readonly<{
  registration: SoloRegistrationView;
  outcome: SoloRegistrationOutcome;
  event: Readonly<{ slug: string; name: string }>;
  promoted: PromotedRegistration[];
}>;

async function assertPlayerMayRegister(tx: Tx, input: RegisterSoloInput, uidKey: string) {
  const user = await tx.user.findUnique({ where: { id: input.userId }, select: { role: true, deactivatedAt: true } });
  if (!user || user.deactivatedAt || user.role !== "player") {
    throw new UserFacingError("Hanya akun pemain yang bisa daftar solo.");
  }
  const existing = await tx.soloRegistration.findUnique({
    where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
  });
  if (existing && existing.status !== "withdrawn" && existing.status !== "expired") {
    throw new UserFacingError("Kamu sudah daftar di event ini.");
  }
  const uidOwner = await tx.soloRegistration.findFirst({
    where: { eventId: input.eventId, uidKey, NOT: { userId: input.userId } },
    select: { id: true },
  });
  if (uidOwner) throw new UserFacingError("UID ini sudah terdaftar di event ini.");
  return existing;
}

/**
 * Registers a player for a solo event. The player gets a slot when their group still has one, and
 * joins the queue when it does not. Runs as one serializable transaction, so two players racing for
 * the last slot cannot both win it.
 */
export async function registerSolo(input: RegisterSoloInput): Promise<RegisterSoloResult> {
  try {
    return await withEventLock(input.eventId, async (tx) => {
      const event = await loadSoloEvent(tx, input.eventId);
      assertNewRegistrationWindowOpen({ ...event });
      const now = new Date();
      const { promoted } = await sweep(tx, event, now);

      const positions = resolvePositions({ primary: input.primaryPosition, secondary: input.secondaryPosition }, event.positions);
      if (!positions.ok) throw new UserFacingError(positions.message);
      const uid = input.uid.trim();
      const uidKey = uid.toLowerCase();
      const existing = await assertPlayerMayRegister(tx, input, uidKey);

      const group = slotGroupOf(positions.primary, event.rules);
      const held = await tx.soloRegistration.count({ where: heldWhere(event.id, group, now) });
      const outcome = decideRegistration({ used: held, quota: event.quota[group], free: !event.registrationFeeRequired });

      const data = {
        ign: input.ign.trim(),
        uid,
        uidKey,
        primaryPosition: positions.primary,
        secondaryPosition: positions.secondary,
        slotGroup: group,
        willingCaptain: input.willingCaptain,
        whatsapp: input.whatsapp,
        status: outcome,
        proofImageUrl: null,
        rejectReason: null,
        slotHeldAt: outcome === "queued" ? null : now,
        expiresAt: outcome === "pending_payment" ? addMs(now, PAYMENT_REQUEST_TTL_MS) : null,
        approvedAt: outcome === "approved" ? now : null,
        withdrawnAt: null,
        refundedAt: null,
        refundNote: null,
      };
      const row = existing
        ? await tx.soloRegistration.update({ where: { id: existing.id }, data: { ...data, createdAt: now, version: { increment: 1 } } })
        : await tx.soloRegistration.create({ data: { ...data, eventId: event.id, userId: input.userId } });
      return { registration: toView(row), outcome, event: { slug: event.slug, name: event.name }, promoted };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = JSON.stringify(error.meta?.target ?? "");
      throw new UserFacingError(target.includes("uidKey") ? "UID ini sudah terdaftar di event ini." : "Kamu sudah daftar di event ini.");
    }
    throw error;
  }
}

type OwnedChange =
  | { ok: true; registration: SoloRegistrationView; promoted: PromotedRegistration[] }
  | { ok: false; message: string; promoted: PromotedRegistration[] };

async function findOwned(tx: Tx | typeof prisma, userId: string, registrationId: string) {
  const row = await tx.soloRegistration.findFirst({ where: { id: registrationId, userId } });
  if (!row) throw new UserFacingError("Pendaftaran tidak ditemukan.");
  return row;
}

/**
 * Attaches payment proof to a registration. Reports a missed deadline as a result instead of
 * throwing, so the expiry and the queue promotion it caused are kept.
 */
export async function uploadSoloProof(input: { userId: string; registrationId: string; proofImageUrl: string }): Promise<
  { registration: SoloRegistrationView; promoted: PromotedRegistration[] }
> {
  const { eventId } = await findOwned(prisma, input.userId, input.registrationId);
  const result: OwnedChange = await withEventLock(eventId, async (tx) => {
    const event = await loadSoloEvent(tx, eventId);
    const { promoted } = await sweep(tx, event, new Date());
    if (event.status !== "Published" && event.status !== "Registration Closed") {
      return { ok: false, message: "Event sudah dimulai sehingga bukti bayar tidak bisa diterima.", promoted };
    }
    const row = await findOwned(tx, input.userId, input.registrationId);
    if (row.status === "expired") {
      return { ok: false, message: "Batas waktu bayar sudah lewat. Daftar lagi untuk dapat slot.", promoted };
    }
    if (row.status !== "pending_payment" && row.status !== "rejected") {
      return { ok: false, message: "Bukti bayar untuk pendaftaran ini tidak bisa diubah.", promoted };
    }
    const updated = await tx.soloRegistration.update({
      where: { id: row.id },
      data: { proofImageUrl: input.proofImageUrl, rejectReason: null, status: "pending_review", version: { increment: 1 } },
    });
    return { ok: true, registration: toView(updated), promoted };
  });
  if (!result.ok) throw new SoloRegistrationNotice(result.message, result.promoted);
  return { registration: result.registration, promoted: result.promoted };
}

/** A refusal the person should read, carrying the queue promotions that still have to be announced. */
export class SoloRegistrationNotice extends UserFacingError {
  constructor(message: string, readonly promoted: PromotedRegistration[]) {
    super(message);
    this.name = "UserFacingError";
  }
}

const WITHDRAWABLE: readonly SoloRegistrationStatus[] = ["queued", "pending_payment", "pending_review", "approved", "rejected"];

/** Lets a player leave while registration is open. A freed slot goes to the next queued player. */
export async function withdrawSolo(input: { userId: string; registrationId: string }): Promise<{
  registration: SoloRegistrationView;
  needsRefund: boolean;
  promoted: PromotedRegistration[];
}> {
  const { eventId } = await findOwned(prisma, input.userId, input.registrationId);
  return withEventLock(eventId, async (tx) => {
    const owned = await findOwned(tx, input.userId, input.registrationId);
    const event = await loadSoloEvent(tx, eventId);
    if (event.status !== "Published") throw new UserFacingError("Pendaftaran sudah ditutup. Hubungi organizer untuk membatalkan.");
    if (!WITHDRAWABLE.includes(owned.status as SoloRegistrationStatus)) {
      throw new UserFacingError("Pendaftaran ini sudah tidak aktif.");
    }
    const now = new Date();
    const updated = await tx.soloRegistration.update({
      where: { id: owned.id },
      data: { status: "withdrawn", withdrawnAt: now, version: { increment: 1 } },
    });
    const { promoted } = await sweep(tx, event, now);
    const needsRefund = event.registrationFeeRequired && (owned.status === "approved" || owned.status === "pending_review");
    return { registration: toView(updated), needsRefund, promoted };
  });
}

async function loadManaged(actor: AppUser, registrationId: string) {
  const row = await prisma.soloRegistration.findUnique({ where: { id: registrationId } });
  if (!row) throw new UserFacingError("Pendaftaran tidak ditemukan.");
  await assertUserCanManageEvent(actor, row.eventId);
  return row;
}

async function applyReview(
  row: SoloRegistrationRow,
  expectedVersion: number,
  from: readonly SoloRegistrationStatus[],
  data: Prisma.SoloRegistrationUncheckedUpdateManyInput,
): Promise<SoloRegistrationView> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: row.eventId }, select: { status: true } });
    if (!event || (event.status !== "Published" && event.status !== "Registration Closed")) {
      throw new UserFacingError("Event sudah tidak menerima perubahan pendaftaran.");
    }
    const changed = await tx.soloRegistration.updateMany({
      where: { id: row.id, version: expectedVersion, status: { in: [...from] } },
      data: { ...data, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new UserFacingError(STALE_MESSAGE);
    return toView(await tx.soloRegistration.findUniqueOrThrow({ where: { id: row.id } }));
  });
}

/** The organizer accepts a payment. Fails with a stale-data message when someone else changed it first. */
export async function approveSolo(input: { actor: AppUser; registrationId: string; expectedVersion: number }): Promise<SoloRegistrationView> {
  const row = await loadManaged(input.actor, input.registrationId);
  return applyReview(row, input.expectedVersion, ["pending_review"], {
    status: "approved",
    approvedAt: new Date(),
    approvedById: input.actor.id,
    rejectReason: null,
  });
}

/** The organizer turns a payment down. The player keeps the slot and may upload new proof until a fresh deadline. */
export async function rejectSolo(input: {
  actor: AppUser;
  registrationId: string;
  reason: string;
  expectedVersion: number;
}): Promise<SoloRegistrationView> {
  const reason = input.reason.trim();
  if (reason.length < MIN_REJECT_REASON || reason.length > MAX_REJECT_REASON) {
    throw new UserFacingError(`Alasan penolakan ${MIN_REJECT_REASON}-${MAX_REJECT_REASON} karakter.`);
  }
  const row = await loadManaged(input.actor, input.registrationId);
  return applyReview(row, input.expectedVersion, ["pending_review", "pending_payment"], {
    status: "rejected",
    rejectReason: reason,
    proofImageUrl: null,
    expiresAt: addMs(new Date(), PAYMENT_REQUEST_TTL_MS),
  });
}

/** Slots in use, free and queued per group, for the public page and the organizer header. */
export async function getSoloQuotaSnapshot(eventId: string): Promise<SoloQuotaSnapshot> {
  const event = await loadSoloEvent(prisma, eventId);
  const now = new Date();
  const [required, open] = await Promise.all(
    SOLO_SLOT_GROUPS.map(async (group) => ({
      quota: event.quota[group],
      held: await prisma.soloRegistration.count({ where: heldWhere(eventId, group, now) }),
      queued: await prisma.soloRegistration.count({ where: { eventId, slotGroup: group, status: "queued" } }),
    })),
  );
  return { required, open };
}

/** The registration a player has for an event, if any. */
export async function getSoloRegistrationForUser(eventId: string, userId: string): Promise<SoloRegistrationView | null> {
  const row = await prisma.soloRegistration.findUnique({ where: { eventId_userId: { eventId, userId } } });
  return row ? toView(row) : null;
}
