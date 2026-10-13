import { randomBytes, randomUUID } from "node:crypto";

import type { Prisma, SoloDraw as SoloDrawRow, SoloDrawAssignment as AssignmentRow, SoloRegistration as RegistrationRow } from "@prisma/client";

import { prisma } from "@/lib/platform/db";
import { assertEventRosterMutable, assertUserCanManageEvent } from "@/lib/platform/repository";
import type { AppUser } from "@/lib/platform/types";
import { UserFacingError } from "@/lib/security/public-error";
import { validateTeamData } from "@/lib/validation/team-data";

import { drawTeams, isLockable, swapPlayers } from "./draw";
import {
  SOLO_CAPTAIN_RULE,
  SOLO_DRAW_ALGORITHM_VERSION,
  loadApprovedCandidates,
  loadDrawEvent,
  toCandidate,
  type DrawEvent,
} from "./draw-support";
import type { SoloDrawMember, SoloDrawStatus, SoloDrawTeam, SoloDrawUnplaced, SoloDrawView } from "./draw-types";
import { withEventLock, type Tx } from "./event-lock";
import { hashDrawInput } from "./hash";
import { checkDrawInvariants } from "./invariants";
import { samePosition } from "./normalize";
import type { SoloAssignment, SoloDrawResult, SoloRules, SoloWarning } from "./types";

const MAX_SEED_LENGTH = 200;
const MIN_TEAMS = 2;
const STALE_MESSAGE = "Data sudah berubah. Muat ulang halaman.";
const LOCKED_MESSAGE = "Tim sudah dikunci.";
const MAX_REFUND_NOTE = 200;
/** Locking writes every team of the event in one transaction, so it gets more time than a single sign-up. */
const LOCK_TIMEOUT_MS = 60_000;

type DrawWithAssignments = SoloDrawRow & { assignments: AssignmentRow[] };

const asWarnings = (value: Prisma.JsonValue): SoloWarning[] => (Array.isArray(value) ? (value as unknown as SoloWarning[]) : []);

function newSeed(): string {
  return randomBytes(16).toString("hex");
}

function toAssignment(row: AssignmentRow): SoloAssignment {
  return {
    registrationId: row.registrationId,
    teamIndex: row.teamIndex,
    role: row.role as SoloAssignment["role"],
    assignedPosition: row.assignedPosition,
    isCaptain: row.isCaptain,
  };
}

function toResult(draw: DrawWithAssignments): SoloDrawResult {
  const warnings = asWarnings(draw.warnings);
  return {
    assignments: draw.assignments.map(toAssignment),
    teamCount: draw.teamCount,
    unplacedCount: draw.unplacedCount,
    warnings,
    canLock: isLockable(draw.teamCount, warnings),
  };
}

async function loadDraw(tx: Tx | typeof prisma, drawId: string): Promise<DrawWithAssignments> {
  const draw = await tx.soloDraw.findUnique({ where: { id: drawId }, include: { assignments: true } });
  if (!draw) throw new UserFacingError("Hasil acak tidak ditemukan.");
  return draw;
}

/** The screen that sends a swap or a lock must be showing the draw as it is now. Otherwise somebody else changed it first. */
function assertSeen(draw: DrawWithAssignments, expectedUpdatedAt: Date): void {
  if (draw.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new UserFacingError(STALE_MESSAGE);
}

/** The draw an organizer can still change: a draft of an event whose teams are not locked yet. */
function assertEditable(draw: DrawWithAssignments, event: DrawEvent): void {
  if (event.activeSoloDrawId !== null || draw.status === "locked") throw new UserFacingError(`${STALE_MESSAGE.split(".")[0]}. ${LOCKED_MESSAGE} Muat ulang halaman.`);
  if (draw.status !== "draft") throw new UserFacingError(`${STALE_MESSAGE.split(".")[0]}. Hasil acak ini sudah diganti. Muat ulang halaman.`);
  if (event.status !== "Registration Closed") throw new UserFacingError("Tutup pendaftaran dulu sebelum mengacak tim.");
}

function sortMembers(members: SoloDrawMember[], rules: SoloRules): SoloDrawMember[] {
  const [required] = Object.keys(rules.requiredPositions);
  return [...members].sort((left, right) => {
    const leftRequired = samePosition(left.position, required) ? 0 : 1;
    const rightRequired = samePosition(right.position, required) ? 0 : 1;
    return leftRequired - rightRequired || left.ign.localeCompare(right.ign);
  });
}

function toTeams(draw: DrawWithAssignments, byId: ReadonlyMap<string, RegistrationRow>, rules: SoloRules): SoloDrawTeam[] {
  return Array.from({ length: draw.teamCount }, (_, index) => {
    const members = draw.assignments
      .filter((assignment) => assignment.teamIndex === index + 1)
      .flatMap((assignment) => {
        const registration = byId.get(assignment.registrationId);
        if (!registration) return [];
        return [{
          registrationId: registration.id,
          ign: registration.ign,
          uid: registration.uid,
          position: assignment.assignedPosition ?? registration.primaryPosition,
          isCaptain: assignment.isCaptain,
          willingCaptain: registration.willingCaptain,
        }];
      });
    return { index: index + 1, members: sortMembers(members, rules) };
  });
}

function toUnplaced(draw: DrawWithAssignments, byId: ReadonlyMap<string, RegistrationRow>, feeRequired: boolean): SoloDrawUnplaced[] {
  return draw.assignments
    .filter((assignment) => assignment.role === "unplaced")
    .flatMap((assignment) => {
      const registration = byId.get(assignment.registrationId);
      if (!registration) return [];
      return [{
        registrationId: registration.id,
        ign: registration.ign,
        uid: registration.uid,
        primaryPosition: registration.primaryPosition,
        refundedAt: registration.refundedAt,
        needsRefund: feeRequired && registration.status === "approved" && registration.refundedAt === null,
      }];
    })
    .sort((left, right) => left.ign.localeCompare(right.ign));
}

async function buildView(db: Tx | typeof prisma, draw: DrawWithAssignments, event: DrawEvent): Promise<SoloDrawView> {
  const rows = await db.soloRegistration.findMany({ where: { id: { in: draw.assignments.map((assignment) => assignment.registrationId) } } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    id: draw.id,
    eventId: draw.eventId,
    version: draw.version,
    status: draw.status as SoloDrawStatus,
    seed: draw.seed,
    teamCount: draw.teamCount,
    unplacedCount: draw.unplacedCount,
    warnings: asWarnings(draw.warnings),
    canLock: isLockable(draw.teamCount, asWarnings(draw.warnings)),
    createdAt: draw.createdAt,
    updatedAt: draw.updatedAt,
    lockedAt: draw.lockedAt,
    teams: toTeams(draw, byId, event.rules),
    unplaced: toUnplaced(draw, byId, event.registrationFeeRequired),
  };
}

/**
 * Draws teams from the approved players and keeps the result as a draft. Drawing again makes a new
 * version and sets the old drafts aside, so every draw stays on record.
 */
export async function createSoloDraw(input: { actor: AppUser; eventId: string; seed?: string }): Promise<SoloDrawView> {
  await assertUserCanManageEvent(input.actor, input.eventId);
  const seed = (input.seed ?? newSeed()).trim();
  if (seed.length === 0 || seed.length > MAX_SEED_LENGTH) throw new UserFacingError("Seed harus 1-200 karakter.");

  return withEventLock(input.eventId, async (tx) => {
    const event = await loadDrawEvent(tx, input.eventId);
    if (event.activeSoloDrawId !== null) throw new UserFacingError(LOCKED_MESSAGE);
    if (event.status !== "Registration Closed") throw new UserFacingError("Tutup pendaftaran dulu sebelum mengacak tim.");

    const { candidates } = await loadApprovedCandidates(tx, event.id);
    const result = drawTeams({ candidates, participantCap: event.participantCap, rules: event.rules, seed });
    if (result.teamCount < MIN_TEAMS) throw new UserFacingError("Pemain yang diterima belum cukup untuk membentuk 2 tim.");

    const latest = await tx.soloDraw.findFirst({ where: { eventId: event.id }, orderBy: { version: "desc" }, select: { version: true } });
    await tx.soloDraw.updateMany({ where: { eventId: event.id, status: "draft" }, data: { status: "superseded" } });
    const draw = await tx.soloDraw.create({
      data: {
        eventId: event.id,
        version: (latest?.version ?? 0) + 1,
        status: "draft",
        seed,
        algorithmVersion: SOLO_DRAW_ALGORITHM_VERSION,
        inputHash: hashDrawInput(candidates),
        config: { ...event.rules, participantCap: event.participantCap, captainRule: SOLO_CAPTAIN_RULE } as unknown as Prisma.InputJsonValue,
        teamCount: result.teamCount,
        unplacedCount: result.unplacedCount,
        warnings: result.warnings as unknown as Prisma.InputJsonValue,
        createdById: input.actor.id,
      },
    });
    await tx.soloDrawAssignment.createMany({
      data: result.assignments.map((assignment) => ({
        drawId: draw.id,
        eventId: event.id,
        registrationId: assignment.registrationId,
        teamIndex: assignment.teamIndex,
        role: assignment.role,
        assignedPosition: assignment.assignedPosition,
        isCaptain: assignment.isCaptain,
      })),
    });
    await tx.competitionAuditLog.create({
      data: {
        eventId: event.id,
        actorUserId: input.actor.id,
        action: "solo_draw_created",
        payload: { drawId: draw.id, version: draw.version, seed, teamCount: result.teamCount, unplacedCount: result.unplacedCount },
      },
    });
    return buildView(tx, await loadDraw(tx, draw.id), event);
  });
}

const SWAP_MESSAGES: ReadonlyArray<readonly [string, string]> = [
  ["same team", "Pilih dua pemain dari tim yang berbeda."],
  ["another position", "Pemain dengan posisi wajib hanya bisa ditukar dengan pemain berposisi sama."],
  ["not in a team", "Pemain yang tidak masuk tim tidak bisa ditukar."],
];

function describeSwapFailure(error: unknown): UserFacingError {
  const message = error instanceof Error ? error.message : "";
  const known = SWAP_MESSAGES.find(([needle]) => message.includes(needle));
  return new UserFacingError(known?.[1] ?? "Dua pemain ini tidak bisa ditukar.");
}

/** Swaps two players between two teams of a draft. The one-keeper-per-team rule is checked again. */
export async function swapSoloPlayers(input: { actor: AppUser; drawId: string; a: string; b: string; expectedUpdatedAt: Date }): Promise<SoloDrawView> {
  const { eventId } = await loadDraw(prisma, input.drawId);
  await assertUserCanManageEvent(input.actor, eventId);

  return withEventLock(eventId, async (tx) => {
    const event = await loadDrawEvent(tx, eventId);
    const draw = await loadDraw(tx, input.drawId);
    assertEditable(draw, event);
    assertSeen(draw, input.expectedUpdatedAt);

    const registrations = await tx.soloRegistration.findMany({ where: { id: { in: draw.assignments.map((assignment) => assignment.registrationId) } } });
    let next: SoloDrawResult;
    try {
      next = swapPlayers({ result: toResult(draw), candidates: registrations.map(toCandidate), a: input.a, b: input.b, rules: event.rules });
    } catch (error) {
      throw describeSwapFailure(error);
    }

    const before = new Map(draw.assignments.map((row) => [row.registrationId, row]));
    for (const assignment of next.assignments) {
      const row = before.get(assignment.registrationId);
      if (!row || (row.teamIndex === assignment.teamIndex && row.isCaptain === assignment.isCaptain)) continue;
      await tx.soloDrawAssignment.update({ where: { id: row.id }, data: { teamIndex: assignment.teamIndex, isCaptain: assignment.isCaptain } });
    }
    await tx.soloDraw.update({ where: { id: draw.id }, data: { warnings: next.warnings as unknown as Prisma.InputJsonValue } });
    await tx.competitionAuditLog.create({
      data: {
        eventId,
        actorUserId: input.actor.id,
        action: "solo_draw_swapped",
        payload: { drawId: draw.id, version: draw.version, a: input.a, b: input.b },
      },
    });
    return buildView(tx, await loadDraw(tx, draw.id), event);
  });
}

/** The draw an organizer should see: the locked one, otherwise the newest draft. Null before the first draw. */
export async function getSoloDrawView(input: { actor: AppUser; eventId: string }): Promise<SoloDrawView | null> {
  await assertUserCanManageEvent(input.actor, input.eventId);
  const event = await loadDrawEvent(prisma, input.eventId);
  const draw = event.activeSoloDrawId
    ? await prisma.soloDraw.findUnique({ where: { id: event.activeSoloDrawId }, include: { assignments: true } })
    : await prisma.soloDraw.findFirst({ where: { eventId: event.id, status: "draft" }, orderBy: { version: "desc" }, include: { assignments: true } });
  return draw ? buildView(prisma, draw, event) : null;
}

type LockMember = Readonly<{ assignment: AssignmentRow; registration: RegistrationRow; userName: string }>;

function pickCaptainName(userName: string, ign: string): string {
  for (const name of [userName, ign]) {
    const problems = validateTeamData({ teamName: "Tim 1", teamTag: "T1", captainName: name });
    if (problems.length === 0) return name.trim();
  }
  throw new UserFacingError("Nama kapten tidak valid. Tukar kapten dulu atau minta pemain mengubah namanya.");
}

/**
 * The tag of team `index`: T1, T2, ... A few of those read as a blocked word once the filter normalises digits
 * to letters (T41 reads as a rude word), so such a team gets TM41 instead of failing the whole lock.
 */
function teamTag(index: number, captainName: string): string {
  let firstProblem: string | null = null;
  for (const tag of [`T${index}`, `TM${index}`]) {
    const problems = validateTeamData({ teamName: `Tim ${index}`, teamTag: tag, captainName });
    if (problems.length === 0) return tag;
    firstProblem ??= problems[0].message;
  }
  throw new UserFacingError(firstProblem ?? "Tag tim tidak valid.");
}

async function loadLockMembers(tx: Tx, draw: DrawWithAssignments): Promise<LockMember[]> {
  const starters = draw.assignments.filter((assignment) => assignment.role === "starter" && assignment.teamIndex !== null);
  const registrations = await tx.soloRegistration.findMany({ where: { id: { in: starters.map((assignment) => assignment.registrationId) } } });
  const users = await tx.user.findMany({ where: { id: { in: registrations.map((row) => row.userId) } }, select: { id: true, name: true } });
  const registrationById = new Map(registrations.map((row) => [row.id, row]));
  const nameById = new Map(users.map((user) => [user.id, user.name]));
  return starters.map((assignment) => {
    const registration = registrationById.get(assignment.registrationId);
    if (!registration) throw new UserFacingError("Pendaftaran pemain tidak ditemukan. Acak ulang dulu.");
    return { assignment, registration, userName: nameById.get(registration.userId) ?? registration.ign };
  });
}

type BuiltTeam = Readonly<{
  team: Prisma.TeamCreateManyInput;
  players: Prisma.PlayerCreateManyInput[];
  links: ReadonlyArray<{ assignmentId: string; teamId: string; playerId: string }>;
}>;

/** The rows of one team and its players, with ids made here so a whole event can be written in a few statements. */
function buildTeam(eventId: string, index: number, members: readonly LockMember[], createdAt: Date): BuiltTeam {
  const captain = members.find((member) => member.assignment.isCaptain);
  if (!captain) throw new UserFacingError("Tiap tim butuh satu kapten. Acak ulang dulu.");
  const captainName = pickCaptainName(captain.userName, captain.registration.ign);
  const tag = teamTag(index, captainName);

  const teamId = randomUUID();
  const rows = members.map((member) => ({ member, playerId: randomUUID() }));
  return {
    team: {
      id: teamId,
      eventId,
      captainId: captain.registration.userId,
      name: `Tim ${index}`,
      tag,
      logoText: tag,
      source: "solo-draw",
      captainName,
      captainIgn: captain.registration.ign,
      captainUid: captain.registration.uid,
      captainIsPlayer: true,
      captainContact: captain.registration.whatsapp,
      createdAt,
    },
    players: rows.map(({ member, playerId }) => ({
      id: playerId,
      teamId,
      eventId,
      displayName: member.registration.uid,
      nickname: member.registration.ign,
      position: member.assignment.assignedPosition ?? "",
      userId: member.registration.userId,
    })),
    links: rows.map(({ member, playerId }) => ({ assignmentId: member.assignment.id, teamId, playerId })),
  };
}

/**
 * Writes every team, player and link of a draw in a handful of statements, so the lock does not grow with the
 * number of players: a hundred teams would otherwise mean over a thousand round trips inside one transaction.
 * The placements are written again with their links filled in (same ids, same order) rather than updated one by one.
 */
async function writeTeams(tx: Tx, built: readonly BuiltTeam[], draw: DrawWithAssignments): Promise<void> {
  const links = new Map(built.flatMap((entry) => entry.links).map((link) => [link.assignmentId, link]));
  const starters = draw.assignments.filter((row) => row.role === "starter");
  if (starters.some((row) => !links.has(row.id)) || links.size !== starters.length) {
    throw new UserFacingError("Hasil acak berubah saat dikunci. Acak ulang dulu.");
  }
  await tx.team.createMany({ data: built.map((entry) => entry.team) });
  await tx.player.createMany({ data: built.flatMap((entry) => entry.players) });
  await tx.soloDrawAssignment.deleteMany({ where: { drawId: draw.id } });
  await tx.soloDrawAssignment.createMany({
    data: draw.assignments.map((row) => ({
      id: row.id,
      drawId: row.drawId,
      eventId: row.eventId,
      registrationId: row.registrationId,
      teamIndex: row.teamIndex,
      role: row.role,
      assignedPosition: row.assignedPosition,
      isCaptain: row.isCaptain,
      teamId: links.get(row.id)?.teamId ?? row.teamId,
      playerId: links.get(row.id)?.playerId ?? row.playerId,
      createdAt: row.createdAt,
    })),
  });
}

function assertLockable(draw: DrawWithAssignments, event: DrawEvent, currentHash: string): void {
  assertEditable(draw, event);
  if (draw.inputHash !== currentHash) throw new UserFacingError("Pendaftar berubah. Acak ulang dulu.");
  const result = toResult(draw);
  if (!result.canLock) throw new UserFacingError("Hasil acak ini belum bisa dikunci. Cek peringatan di panel.");
  const violations = checkDrawInvariants(result, event.rules);
  if (violations.length > 0) throw new UserFacingError("Susunan tim belum valid. Acak ulang dulu.");
}

/**
 * Turns a draft into real teams. Each team and player is created through the same tables a captain's
 * registration uses, so groups, brackets and schedules work on them without any change.
 * Refuses when the approved players changed since the draw, or when teams are already locked.
 */
export async function lockSoloDraw(input: { actor: AppUser; drawId: string; expectedUpdatedAt: Date }): Promise<{ teamIds: readonly string[] }> {
  const { eventId } = await loadDraw(prisma, input.drawId);
  await assertUserCanManageEvent(input.actor, eventId);

  return withEventLock(eventId, async (tx) => {
    await assertEventRosterMutable(tx, eventId);
    const event = await loadDrawEvent(tx, eventId);
    const draw = await loadDraw(tx, input.drawId);
    const { candidates } = await loadApprovedCandidates(tx, eventId);
    assertLockable(draw, event, hashDrawInput(candidates));
    assertSeen(draw, input.expectedUpdatedAt);
    if ((await tx.team.count({ where: { eventId } })) > 0) throw new UserFacingError("Event ini sudah punya tim. Tim solo tidak bisa dikunci.");

    const members = await loadLockMembers(tx, draw);
    const base = Date.now();
    const built = Array.from({ length: draw.teamCount }, (_, offset) => {
      const index = offset + 1;
      return buildTeam(eventId, index, members.filter((member) => member.assignment.teamIndex === index), new Date(base + index));
    });
    await writeTeams(tx, built, draw);

    const now = new Date();
    await tx.soloDraw.updateMany({ where: { eventId, status: "draft", id: { not: draw.id } }, data: { status: "superseded" } });
    await tx.soloDraw.update({ where: { id: draw.id }, data: { status: "locked", lockedById: input.actor.id, lockedAt: now } });
    await tx.event.update({ where: { id: eventId }, data: { activeSoloDrawId: draw.id } });
    await tx.competitionAuditLog.create({
      data: {
        eventId,
        actorUserId: input.actor.id,
        action: "solo_draw_locked",
        payload: { drawId: draw.id, version: draw.version, seed: draw.seed, teamCount: draw.teamCount, unplacedCount: draw.unplacedCount },
      },
    });
    return { teamIds: built.map((entry) => String(entry.team.id)) };
  }, { timeoutMs: LOCK_TIMEOUT_MS });
}

/**
 * A player is owed a refund when they paid and are out: approved but without a team in the current draw, or
 * withdrawn after being approved. A player who is in a team, or who never paid, is not.
 */
async function owesRefund(tx: Tx, event: DrawEvent, registration: RegistrationRow): Promise<boolean> {
  if (registration.status === "withdrawn") return registration.approvedAt !== null;
  if (registration.status !== "approved") return false;
  const draw = event.activeSoloDrawId
    ? { id: event.activeSoloDrawId }
    : await tx.soloDraw.findFirst({ where: { eventId: event.id, status: "draft" }, orderBy: { version: "desc" }, select: { id: true } });
  if (!draw) return false;
  const placement = await tx.soloDrawAssignment.findFirst({
    where: { drawId: draw.id, registrationId: registration.id, role: "unplaced" },
    select: { id: true },
  });
  return placement !== null;
}

/** Records that the organizer paid a player back. Only for players who paid and did not get a team or left. */
export async function markSoloRefunded(input: { actor: AppUser; registrationId: string; note?: string }): Promise<void> {
  const row = await prisma.soloRegistration.findUnique({ where: { id: input.registrationId }, select: { eventId: true } });
  if (!row) throw new UserFacingError("Pendaftaran tidak ditemukan.");
  await assertUserCanManageEvent(input.actor, row.eventId);
  const note = input.note?.trim() ?? "";
  if (note.length > MAX_REFUND_NOTE) throw new UserFacingError(`Catatan refund maksimal ${MAX_REFUND_NOTE} karakter.`);

  await withEventLock(row.eventId, async (tx) => {
    const event = await loadDrawEvent(tx, row.eventId);
    if (!event.registrationFeeRequired) throw new UserFacingError("Event ini gratis, tidak ada refund.");
    const registration = await tx.soloRegistration.findUniqueOrThrow({ where: { id: input.registrationId } });
    if (registration.refundedAt) throw new UserFacingError("Refund pemain ini sudah dicatat.");
    if (!(await owesRefund(tx, event, registration))) {
      throw new UserFacingError("Hanya pemain yang sudah bayar dan tidak masuk tim yang bisa dicatat refund.");
    }
    await tx.soloRegistration.update({
      where: { id: registration.id },
      data: { refundedAt: new Date(), refundNote: note || null, version: { increment: 1 } },
    });
    await tx.competitionAuditLog.create({
      data: { eventId: event.id, actorUserId: input.actor.id, action: "solo_refund_marked", payload: { registrationId: registration.id } },
    });
  });
}
