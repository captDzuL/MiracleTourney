import { isEmailDeliveryConfigured, sendEmail } from "@/lib/email/send";
import { writeServerLog } from "@/lib/observability/logger";
import { prisma } from "@/lib/platform/db";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import { assertEventRosterMutable, isNewRegistrationWindowOpen, readEventRosterLocked, runSerializableRegistrationTransaction } from "@/lib/platform/shared/tx";
import type { AppUser } from "@/lib/platform/types";
import { buildCompletionEmail } from "@/lib/registration/completion-email";
import {
  extendedDeadline,
  getCompletionGaps,
  getCompletionState,
  getRequiredPlayers,
  hasCompletionGaps,
  newCompletionDeadline,
} from "@/lib/registration/completion";
import { UserFacingError } from "@/lib/security/public-error";
import { randomUUID } from "node:crypto";

/**
 * Flagging, suspending and extending only happen while registration is open (status Published, inside the opening and
 * closing times). The captain can still fill in the contact until the roster locks, so that has a wider list.
 */
const CONTACT_EDITABLE_EVENT_STATUSES = ["Published", "Registration Closed"];
/** Imported captains get a made-up address on this domain, so mail to it would only bounce. */
const SYNTHETIC_EMAIL_DOMAIN = "@miraclefc.gg";

export type TeamCompletionSyncResult = {
  flagged: number;
  cleared: number;
  emailed: number;
  emailFailed: number;
  emailSkipped: number;
};

function dashboardUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "";
  return `${base.replace(/\/$/, "")}/id/captain`;
}

function logFailure(operation: string, error: unknown) {
  writeServerLog({
    phase: "failed",
    operation,
    route: "/api/cron/team-completion",
    requestId: randomUUID(),
    durationMs: 0,
    status: 500,
    errorCode: error instanceof Error ? error.name : "unknown",
  });
}

/**
 * Flags teams that miss a captain contact or a full roster, starts their two-day deadline and emails the captain once.
 * A team that became complete loses its flag. Safe to run again and again: it only acts on changes.
 */
export async function syncTeamCompletion(now: Date = new Date()): Promise<TeamCompletionSyncResult> {
  const result: TeamCompletionSyncResult = { flagged: 0, cleared: 0, emailed: 0, emailFailed: 0, emailSkipped: 0 };
  const canEmail = isEmailDeliveryConfigured();

  const events = await prisma.event.findMany({
    where: { status: "Published" },
    select: { id: true, name: true, gameModeId: true, status: true, registrationOpensAt: true, registrationClosesAt: true },
  });

  for (const event of events) {
    if (!isNewRegistrationWindowOpen(event, now)) continue;
    try {
      await syncEventTeams(event, now, canEmail, result);
    } catch (error) {
      logFailure("team_completion_event", error);
    }
  }

  return result;
}

async function syncEventTeams(
  event: { id: string; name: string; gameModeId: string },
  now: Date,
  canEmail: boolean,
  result: TeamCompletionSyncResult,
): Promise<void> {
  if (await readEventRosterLocked(prisma, event.id)) return;
  const requiredPlayers = getRequiredPlayers(event.gameModeId);
  if (requiredPlayers === null) throw new Error("Unknown game mode config");
  const teams = await prisma.team.findMany({
    where: { eventId: event.id, suspendedAt: null },
    select: {
      id: true,
      name: true,
      captainContact: true,
      completionDeadlineAt: true,
      completionNotifiedAt: true,
      captain: { select: { email: true } },
      _count: { select: { players: { where: { removedAt: null } } } },
    },
  });

  for (const team of teams) {
    const gaps = getCompletionGaps({ captainContact: team.captainContact, playerCount: team._count.players, requiredPlayers });

    if (!hasCompletionGaps(gaps)) {
      if (team.completionDeadlineAt || team.completionNotifiedAt) {
        await prisma.team.update({ where: { id: team.id }, data: { completionDeadlineAt: null, completionNotifiedAt: null } });
        result.cleared += 1;
      }
      continue;
    }

    let deadline = team.completionDeadlineAt;
    if (!deadline) {
      deadline = newCompletionDeadline(now);
      await prisma.team.update({ where: { id: team.id }, data: { completionDeadlineAt: deadline } });
      result.flagged += 1;
    }
    if (team.completionNotifiedAt) continue;

    const to = team.captain?.email;
    if (!to || to.toLowerCase().endsWith(SYNTHETIC_EMAIL_DOMAIN) || !canEmail) {
      result.emailSkipped += 1;
      continue;
    }
    try {
      const email = buildCompletionEmail({ teamName: team.name, eventName: event.name, gaps, deadline, dashboardUrl: dashboardUrl() });
      await sendEmail({ to, subject: email.subject, html: email.html });
      await prisma.team.update({ where: { id: team.id }, data: { completionNotifiedAt: now } });
      result.emailed += 1;
    } catch (error) {
      logFailure("team_completion_email", error);
      result.emailFailed += 1;
    }
  }
}

type TeamForDecision = {
  captainContact: string | null;
  completionDeadlineAt: Date | null;
  _count: { players: number };
};

async function readTeamForDecision(
  tx: Pick<typeof prisma, "team" | "event">,
  eventId: string,
  teamId: string,
  now: Date,
): Promise<{ team: TeamForDecision; requiredPlayers: number }> {
  const [event, team] = await Promise.all([
    tx.event.findUnique({
      where: { id: eventId },
      select: { gameModeId: true, status: true, registrationOpensAt: true, registrationClosesAt: true },
    }),
    tx.team.findFirst({
      where: { id: teamId, eventId, suspendedAt: null },
      select: {
        captainContact: true,
        completionDeadlineAt: true,
        _count: { select: { players: { where: { removedAt: null } } } },
      },
    }),
  ]);
  if (!event || !team) throw new UserFacingError("Tim tidak ditemukan di event ini.");
  if (!isNewRegistrationWindowOpen(event, now)) {
    throw new UserFacingError("Penangguhan dan perpanjangan hanya bisa dilakukan selama pendaftaran event masih dibuka.");
  }
  const requiredPlayers = getRequiredPlayers(event.gameModeId);
  if (requiredPlayers === null) throw new UserFacingError("Mode game event ini tidak dikenal.");
  return { team, requiredPlayers };
}

function decisionState(team: TeamForDecision, requiredPlayers: number, now: Date) {
  const gaps = getCompletionGaps({ captainContact: team.captainContact, playerCount: team._count.players, requiredPlayers });
  return getCompletionState(gaps, team.completionDeadlineAt, now);
}

/** Takes the team out of the event so its slot opens again. Only after the deadline, and only while the roster can change. */
export async function suspendIncompleteTeam(user: AppUser, eventId: string, teamId: string, now: Date = new Date()): Promise<void> {
  await assertUserCanManageEvent(user, eventId);
  await runSerializableRegistrationTransaction(async (tx) => {
    await assertEventRosterMutable(tx, eventId);
    const { team, requiredPlayers } = await readTeamForDecision(tx, eventId, teamId, now);
    if (decisionState(team, requiredPlayers, now) !== "overdue") {
      throw new UserFacingError("Tim ini belum melewati tenggat, atau datanya sudah lengkap.");
    }
    // Drawing rows point at the team through (eventId, teamId), so the team cannot leave the event while it is in one.
    const inDrawing = await tx.team.count({
      where: { id: teamId, OR: [{ competitionGroupMemberships: { some: {} } }, { matchReadiness: { some: {} } }, { competitionActionItems: { some: {} } }] },
    });
    if (inDrawing > 0) throw new UserFacingError("Tim ini sudah masuk drawing. Hapus drawing event ini dulu, lalu tangguhkan tim.");
    await tx.team.update({ where: { id: teamId }, data: { eventId: null, suspendedAt: now, suspendedFromEventId: eventId } });
    await tx.player.updateMany({ where: { teamId }, data: { eventId: null } });
  });
}

/** Puts a suspended team back if its slot is still free. It gets a fresh two-day deadline. */
export async function restoreSuspendedTeam(user: AppUser, eventId: string, teamId: string, now: Date = new Date()): Promise<void> {
  await assertUserCanManageEvent(user, eventId);
  try {
    await runSerializableRegistrationTransaction(async (tx) => {
      await assertEventRosterMutable(tx, eventId);
      const [event, team] = await Promise.all([
        tx.event.findUnique({ where: { id: eventId }, select: { participantCap: true } }),
        tx.team.findFirst({
          where: { id: teamId, eventId: null, suspendedFromEventId: eventId, suspendedAt: { not: null } },
          select: { captainId: true },
        }),
      ]);
      if (!event || !team) throw new UserFacingError("Tim yang ditangguhkan tidak ditemukan.");

      const [registered, pendingReview, captainTeam] = await Promise.all([
        tx.team.count({ where: { eventId } }),
        tx.teamRegistrationRequest.count({ where: { eventId, status: "pending_review" } }),
        team.captainId ? tx.team.findFirst({ where: { eventId, captainId: team.captainId }, select: { id: true } }) : Promise.resolve(null),
      ]);
      if (registered + pendingReview >= event.participantCap) throw new UserFacingError("Slot pendaftaran event ini sudah penuh.");
      if (captainTeam) throw new UserFacingError("Kapten ini sudah punya tim lain di event ini.");

      await tx.team.update({
        where: { id: teamId },
        data: { eventId, suspendedAt: null, suspendedFromEventId: null, completionDeadlineAt: newCompletionDeadline(now), completionNotifiedAt: null },
      });
      await tx.player.updateMany({ where: { teamId }, data: { eventId } });
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : "";
    if (code === "P2002") throw new UserFacingError("Nama atau tag tim ini sudah dipakai tim lain di event ini.");
    throw error;
  }
}

export type CaptainCompletionNotice = {
  teamId: string;
  teamName: string;
  eventName: string;
  missingContact: boolean;
  missingPlayers: number;
  state: "incomplete" | "pending" | "overdue";
  deadlineAt?: string;
  suspended: boolean;
};

/** What the captain still has to fill in, per team in an event that is still open, plus teams that were suspended. */
export async function getCaptainCompletionNotices(captainId: string, now: Date = new Date()): Promise<CaptainCompletionNotice[]> {
  const teams = await prisma.team.findMany({
    where: { captainId, OR: [{ eventId: { not: null }, suspendedAt: null }, { suspendedAt: { not: null } }] },
    select: {
      id: true,
      name: true,
      eventId: true,
      suspendedFromEventId: true,
      suspendedAt: true,
      captainContact: true,
      completionDeadlineAt: true,
      _count: { select: { players: { where: { removedAt: null } } } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const eventIds = [...new Set(teams.map((team) => team.eventId ?? team.suspendedFromEventId).filter((id): id is string => Boolean(id)))];
  if (!eventIds.length) return [];
  const events = new Map(
    (await prisma.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, name: true, status: true, gameModeId: true, registrationOpensAt: true, registrationClosesAt: true } }))
      .map((event) => [event.id, event] as const),
  );

  const notices: CaptainCompletionNotice[] = [];
  for (const team of teams) {
    const event = events.get((team.eventId ?? team.suspendedFromEventId) ?? "");
    if (!event) continue;
    const suspended = Boolean(team.suspendedAt);
    const requiredPlayers = getRequiredPlayers(event.gameModeId);
    if (requiredPlayers === null || !isNewRegistrationWindowOpen(event, now)) continue;
    const gaps = getCompletionGaps({ captainContact: team.captainContact, playerCount: team._count.players, requiredPlayers });
    const state = getCompletionState(gaps, team.completionDeadlineAt, now);
    if (state === "complete" && !suspended) continue;
    notices.push({
      teamId: team.id,
      teamName: team.name,
      eventName: event.name,
      ...gaps,
      state: state === "complete" ? "incomplete" : state,
      ...(team.completionDeadlineAt ? { deadlineAt: team.completionDeadlineAt.toISOString() } : {}),
      suspended,
    });
  }
  return notices;
}

/** Saves the captain contact of one of the captain's own teams. */
export async function updateCaptainTeamContact(captainId: string, teamId: string, captainContact: string): Promise<void> {
  const updated = await prisma.team.updateMany({
    where: { id: teamId, captainId, OR: [{ eventId: null }, { event: { status: { in: CONTACT_EDITABLE_EVENT_STATUSES } } }] },
    data: { captainContact },
  });
  if (updated.count !== 1) throw new UserFacingError("Tim tidak ditemukan.");
}

/** Gives a team that still has gaps two more days. */
export async function extendCompletionDeadline(user: AppUser, eventId: string, teamId: string, now: Date = new Date()): Promise<void> {
  await assertUserCanManageEvent(user, eventId);
  const { team, requiredPlayers } = await readTeamForDecision(prisma, eventId, teamId, now);
  if (decisionState(team, requiredPlayers, now) === "complete") {
    throw new UserFacingError("Data tim ini sudah lengkap.");
  }
  await prisma.team.update({ where: { id: teamId }, data: { completionDeadlineAt: extendedDeadline(team.completionDeadlineAt, now) } });
}
