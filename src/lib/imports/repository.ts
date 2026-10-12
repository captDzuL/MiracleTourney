// Team and registration import: snapshots, preview batches, history and commit.
// Moved out of platform/repository.ts without changes (refactor PR 2.9).

import { isEventBracketLocked } from "@/lib/bracket/repository";
import type { RegistrationNormalizedTeam, RegistrationPreviewItem, RegistrationSourceKind } from "@/lib/imports/registration-intake";
import { prisma } from "@/lib/platform/db";
import { assertReaderResultWithinLimit, readerProbeLimit } from "@/lib/platform/reader-bounds";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import { ORGANIZER_READER_HISTORY_LIMIT, ORGANIZER_READER_IMPORT_BATCH_LIMIT, ORGANIZER_READER_IMPORT_ITEM_LIMIT, ORGANIZER_READER_ROW_LIMIT, ROSTER_LOCKED_MESSAGE } from "@/lib/platform/shared/constants";
import { mapTeam } from "@/lib/platform/shared/mappers";
import { assertEventExists, assertEventRosterMutable, runSerializableRegistrationTransaction } from "@/lib/platform/shared/tx";
import type { AppUser, Team, TeamRegistrationRequestStatus } from "@/lib/platform/types";
import { mapRequestStatus, normalizeRegistrationSource } from "@/lib/registration/records";
import type { RegistrationRecord } from "@/lib/registration/records";
import { generateSyntheticRegistrationEmail } from "@/lib/registration/repository";
import { UserFacingError } from "@/lib/security/public-error";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

export function generateTempPassword(): string {
  return randomBytes(6).toString("base64url").slice(0, 8);
}

export function generateCaptainEmail(tag: string, usedInBatch: Set<string>, explicitEmail?: string): string {
  if (explicitEmail) {
    usedInBatch.add(explicitEmail);
    return explicitEmail;
  }
  let candidate = `${tag.toLowerCase()}@miraclefc.gg`;
  let n = 2;
  while (usedInBatch.has(candidate)) {
    candidate = `${tag.toLowerCase()}${n}@miraclefc.gg`;
    n++;
  }
  usedInBatch.add(candidate);
  return candidate;
}

/**
 * Returns a lightweight snapshot of events and registered teams used by CSV import validation.
 * Includes `bracketLocked` flag so the validator can reject imports into locked events.
 */
export async function getImportSnapshot(user?: AppUser) {
  const eventWhere = user?.role === "organizer" ? { organizerUserId: user.id } : undefined;
  const events = await prisma.event.findMany({
    where: eventWhere,
    select: { id: true, slug: true, participantCap: true },
  });
  const eventIds = events.map((event) => event.id);
  const teams = await prisma.team.findMany({
    where: eventWhere ? { eventId: { in: eventIds } } : { eventId: { not: null } },
    select: { eventId: true, name: true, tag: true },
  });

  const lockedSet = new Set<string>();
  await Promise.all(
    events.map(async (event) => {
      const locked = await isEventBracketLocked(event.id);
      if (locked) lockedSet.add(event.id);
    }),
  );

  return {
    events: events.map((event) => ({
      id: event.id,
      slug: event.slug,
      participantCap: event.participantCap,
      bracketLocked: lockedSet.has(event.id),
    })),
    teams: teams.flatMap((team) => team.eventId ? [{ eventId: team.eventId, name: team.name, tag: team.tag }] : []),
  };
}

/** Returns teams created via CSV import. Organizers only see teams from their own events. */
export async function getImportedTeams(user?: AppUser): Promise<Team[]> {
  const rows = await prisma.team.findMany({
    where: {
      eventId: { not: null },
      source: { in: ["csv-import", "registration-intake"] },
      ...(user?.role === "organizer" ? { event: { organizerUserId: user.id } } : {}),
    },
    include: { captain: { select: { id: true, name: true } } },
  });
  return rows.map(mapTeam);
}

/**
 * Returns captain credentials (email + temp password) for all CSV-imported teams in an event.
 * Used by the admin panel to distribute login details to captains after import.
 */
export async function getCaptainCredentialsForEvent(eventId: string) {
  const teams = await prisma.team.findMany({
    where: { eventId, source: { in: ["csv-import", "registration-intake"] } },
    orderBy: { createdAt: "asc" },
    include: { captain: { select: { id: true, name: true } } },
  });
  const captainIds = teams.map((t) => t.captainId).filter(Boolean) as string[];
  const users = captainIds.length
    ? await prisma.user.findMany({ where: { id: { in: captainIds } } })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return teams.map((team) => {
    const user = team.captainId ? userMap.get(team.captainId) : null;
    return {
      teamName: team.name,
      teamTag: team.tag,
      captainName: team.captainName ?? "",
      captainContact: team.captainContact ?? "",
      email: user?.email ?? "",
      tempPassword: user?.tempPassword ?? "",
    };
  });
}

/**
 * Bulk-imports teams from a validated CSV row list. For each team, generates a captain User
 * (upserted by email) with a temp password, then creates the Team row.
 * Bcrypt hashing runs outside the DB transaction to avoid holding a connection during slow crypto.
 * Throws if any target event's bracket is already locked.
 */
export async function importTeams(input: Array<{
  eventId: string;
  teamName: string;
  teamTag: string;
  captainName: string;
  captainContact: string;
  captainEmail?: string;
}>): Promise<Team[]> {
  const eventIds = [...new Set(input.map((row) => row.eventId))];

  // Hashing remains outside the transaction; every database write is committed
  // atomically only after each target event wins the roster-version lock.
  const usedEmails = new Set<string>();
  const preparedRows = await Promise.all(
    input.map(async (row) => {
      const email = generateCaptainEmail(row.teamTag, usedEmails, row.captainEmail);
      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      return { ...row, email, tempPassword, passwordHash };
    }),
  );

  const rows = await runSerializableRegistrationTransaction(async (tx) => {
    for (const eventId of eventIds) await assertEventRosterMutable(tx, eventId);
    const created = [];
    for (const prep of preparedRows) {
      const captain = await tx.user.upsert({
        where: { email: prep.email },
        update: { name: prep.captainName, passwordHash: prep.passwordHash, tempPassword: prep.tempPassword },
        create: {
          email: prep.email,
          name: prep.captainName,
          role: "captain",
          passwordHash: prep.passwordHash,
          tempPassword: prep.tempPassword,
        },
      });
      created.push(await tx.team.create({
        data: {
          eventId: prep.eventId,
          captainId: captain.id,
          name: prep.teamName,
          logoText: prep.teamTag.slice(0, 2).toUpperCase(),
          tag: prep.teamTag.toUpperCase(),
          captainName: prep.captainName,
          captainContact: prep.captainContact,
          source: "csv-import",
        },
      }));
    }
    return created;
  });

  return rows.map(mapTeam);
}

export async function saveRegistrationImportPreviewBatch(input: {
  user: AppUser;
  eventId: string;
  sourceKind: RegistrationSourceKind;
  sourceLabel: string;
  worksheetName?: string;
  headerSignature: string;
  mapping: Prisma.InputJsonValue;
  items: RegistrationPreviewItem[];
  summary: Prisma.InputJsonValue;
}) {
  await assertUserCanManageEvent(input.user, input.eventId);

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const profile = await prisma.registrationImportProfile.create({
    data: {
      eventId: input.eventId,
      createdById: input.user.id,
      sourceKind: input.sourceKind,
      sourceLabel: input.sourceLabel,
      worksheetName: input.worksheetName,
      headerSignature: input.headerSignature,
      mapping: input.mapping,
    },
  });

  return prisma.registrationImportBatch.create({
    data: {
      eventId: input.eventId,
      profileId: profile.id,
      createdById: input.user.id,
      sourceKind: input.sourceKind,
      sourceLabel: input.sourceLabel,
      worksheetName: input.worksheetName,
      status: "draft",
      summary: input.summary,
      expiresAt,
      items: {
        create: input.items.map((item) => ({
          sourceRow: item.sourceRow,
          status: item.status,
          selected: item.selected,
          normalizedData: item.normalized as Prisma.InputJsonValue | undefined,
          diff: item.diff as Prisma.InputJsonValue | undefined,
          validationErrors: item.errors as Prisma.InputJsonValue | undefined,
          teamId: item.existingTeamId,
        })),
      },
    },
    include: { items: true },
  });
}

export async function getRegistrationImportBatchesForEvent(user: AppUser, eventId: string) {
  await assertUserCanManageEvent(user, eventId);
  const rows = await prisma.registrationImportBatch.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    take: readerProbeLimit(ORGANIZER_READER_IMPORT_BATCH_LIMIT),
    include: { items: { select: { id: true, status: true, teamId: true }, take: readerProbeLimit(ORGANIZER_READER_IMPORT_ITEM_LIMIT) } },
  });
  const latestRows = rows.slice(0, ORGANIZER_READER_IMPORT_BATCH_LIMIT);
  for (const row of latestRows) assertReaderResultWithinLimit("organizer.importBatches.items", row.items, ORGANIZER_READER_IMPORT_ITEM_LIMIT);
  return latestRows;
}

export type RegistrationImportHistoryEntry = {
  id: string;
  eventId: string;
  sourceKind: string;
  sourceLabel: string;
  worksheetName?: string | null;
  status: string;
  summary: unknown;
  expiresAt: Date;
  committedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
  items: Array<{ id: string; status: string; teamId?: string | null }>;
};

export type RegistrationImportEventContext = {
  id: string;
  slug: string;
  name: string;
  gameModeId: string;
  participantCap: number;
  format: string;
  teams: Array<{
    id: string;
    name: string;
    tag: string;
    captainName: string | null;
    captainContact: string | null;
    players: Array<{ nickname: string; displayName: string; position: string }>;
  }>;
};

export async function getRegistrationRecordsForEvent(user: AppUser, eventId: string): Promise<RegistrationRecord[]> {
  await assertUserCanManageEvent(user, eventId);
  await assertEventExists(eventId);

  const [teams, requests] = await Promise.all([
    prisma.team.findMany({
      where: { eventId },
      include: {
        players: { where: { removedAt: null }, select: { id: true }, take: readerProbeLimit(ORGANIZER_READER_ROW_LIMIT) },
        captain: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: readerProbeLimit(ORGANIZER_READER_ROW_LIMIT),
    }),
    prisma.teamRegistrationRequest.findMany({
      where: {
        eventId,
        status: { in: ["pending_payment", "pending_review", "rejected", "expired"] },
      },
      include: { captain: { select: { id: true, name: true, email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: readerProbeLimit(ORGANIZER_READER_ROW_LIMIT),
    }),
  ]);

  const teamIds = teams.map((team) => team.id);
  const importedItems = teamIds.length === 0
    ? []
    : await prisma.registrationImportItem.findMany({
        where: { teamId: { in: teamIds } },
        select: { teamId: true, batch: { select: { sourceKind: true } } },
        orderBy: { createdAt: "desc" },
        take: readerProbeLimit(ORGANIZER_READER_ROW_LIMIT),
      });
  assertReaderResultWithinLimit("organizer.registration.teams", teams, ORGANIZER_READER_ROW_LIMIT);
  assertReaderResultWithinLimit("organizer.registration.requests", requests, ORGANIZER_READER_ROW_LIMIT);
  for (const team of teams) assertReaderResultWithinLimit("organizer.registration.players", team.players, ORGANIZER_READER_ROW_LIMIT);
  assertReaderResultWithinLimit("organizer.registration.importItems", importedItems, ORGANIZER_READER_ROW_LIMIT);
  const importKindByTeam = new Map<string, string>();
  for (const item of importedItems) {
    if (item.teamId && !importKindByTeam.has(item.teamId)) importKindByTeam.set(item.teamId, item.batch.sourceKind);
  }

  const teamRecords: RegistrationRecord[] = teams.map((team) => ({
    id: team.id,
    eventId,
    teamId: team.id,
    teamName: team.name,
    teamTag: team.tag,
    captainName: team.captainName ?? team.captain?.name ?? "",
    ...(team.captainContact ? { captainContact: team.captainContact } : {}),
    ...(team.captainIgn ? { captainIgn: team.captainIgn } : {}),
    ...(team.captainUid ? { captainUid: team.captainUid } : {}),
    captainIsPlayer: team.captainIsPlayer,
    rosterCount: team.players.length,
    source: normalizeRegistrationSource(team.source, importKindByTeam.get(team.id)),
    status: "accepted",
    createdAt: team.createdAt,
    origin: "Team",
  }));

  const requestRecords: RegistrationRecord[] = requests.map((request) => ({
    id: request.id,
    eventId,
    ...(request.teamId ? { teamId: request.teamId } : {}),
    teamName: request.teamName,
    teamTag: request.teamTag,
    captainName: request.captain?.name ?? "",
    ...(request.captain?.email ? { captainContact: request.captain.email } : {}),
    captainIsPlayer: true,
    rosterCount: 0,
    source: "captain_registration",
    status: mapRequestStatus(request.status as TeamRegistrationRequestStatus),
    createdAt: request.createdAt,
    origin: "TeamRegistrationRequest",
  }));

  return [...teamRecords, ...requestRecords];
}

export async function getRegistrationImportHistoryForEvent(user: AppUser, eventId: string): Promise<RegistrationImportHistoryEntry[]> {
  await assertUserCanManageEvent(user, eventId);
  await assertEventExists(eventId);
  const rows = await prisma.registrationImportBatch.findMany({
    where: { eventId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: readerProbeLimit(ORGANIZER_READER_HISTORY_LIMIT),
    select: {
      id: true,
      eventId: true,
      sourceKind: true,
      sourceLabel: true,
      worksheetName: true,
      status: true,
      summary: true,
      expiresAt: true,
      committedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { items: true } },
    },
  });
  return rows.slice(0, ORGANIZER_READER_HISTORY_LIMIT).map((row) => ({
    id: row.id,
    eventId: row.eventId,
    sourceKind: row.sourceKind,
    sourceLabel: row.sourceLabel,
    worksheetName: row.worksheetName,
    status: row.status,
    summary: row.summary,
    expiresAt: row.expiresAt,
    committedAt: row.committedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    itemCount: row._count.items,
    items: [],
  }));
}

export async function getRegistrationImportEventContext(user: AppUser, eventId: string): Promise<RegistrationImportEventContext | null> {
  await assertUserCanManageEvent(user, eventId);
  const row = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, slug: true, name: true, gameModeId: true, participantCap: true, format: true,
      teams: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: readerProbeLimit(ORGANIZER_READER_ROW_LIMIT),
        select: {
          id: true, name: true, tag: true, captainName: true, captainContact: true,
          players: { where: { removedAt: null }, select: { nickname: true, displayName: true, position: true }, orderBy: { createdAt: "asc" }, take: readerProbeLimit(ORGANIZER_READER_ROW_LIMIT) },
        },
      },
    },
  });
  if (!row) return null;
  assertReaderResultWithinLimit("organizer.importContext.teams", row.teams, ORGANIZER_READER_ROW_LIMIT);
  for (const team of row.teams) assertReaderResultWithinLimit("organizer.importContext.players", team.players, ORGANIZER_READER_ROW_LIMIT);
  return row;
}

export async function getRegistrationImportUsersByEmails(user: AppUser, eventId: string, emails: string[]) {
  await assertUserCanManageEvent(user, eventId);
  await assertEventExists(eventId);
  const normalized = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (normalized.length === 0) return [];
  return prisma.user.findMany({ where: { email: { in: normalized } }, select: { id: true, email: true, role: true } });
}

export async function getRegistrationImportBatchForAdmin(user: AppUser, batchId: string) {
  const batch = await prisma.registrationImportBatch.findFirst({
    where: { id: batchId },
    include: {
      items: { orderBy: { sourceRow: "asc" } },
    },
  });
  if (!batch) return null;
  await assertUserCanManageEvent(user, batch.eventId);
  return batch;
}

export async function commitRegistrationImportBatch(
  user: AppUser,
  batchId: string,
  selectedItemIds: string[],
): Promise<{
  importedCount: number;
  credentials: Array<{
    teamName: string;
    teamTag: string;
    captainName: string;
    captainContact: string;
    email: string;
    tempPassword: string;
  }>;
}> {
  const batch = await prisma.registrationImportBatch.findFirst({
    where: { id: batchId },
    include: {
      event: { select: { id: true, slug: true, format: true, participantCap: true } },
      items: true,
    },
  });

  if (!batch) throw new Error("Batch import registrasi tidak ditemukan.");
  await assertUserCanManageEvent(user, batch.eventId);
  const locked = await isEventBracketLocked(batch.eventId);
  if (locked) {
    throw new UserFacingError(ROSTER_LOCKED_MESSAGE);
  }

  if (batch.status === "committed") return { importedCount: 0, credentials: [] };
  if (batch.expiresAt <= new Date()) throw new Error("Batch import registrasi sudah kedaluwarsa.");
  if (batch.items.some((item) => item.status === "error")) {
    throw new Error("Perbaiki semua baris error sebelum melakukan import.");
  }
  const candidateItems = batch.items.filter((item) => item.status === "new" || item.status === "changed");
  const selectedIds = new Set(selectedItemIds);
  if (candidateItems.length === 0) throw new Error("Tidak ada baris baru atau berubah untuk diimport.");
  if (selectedIds.size !== candidateItems.length || candidateItems.some((item) => !selectedIds.has(item.id))) {
    throw new Error("Import harus menyertakan seluruh baris baru dan berubah dalam satu transaksi.");
  }

  const usedEmails = new Set<string>();
  const prepared = await Promise.all(
    candidateItems.map(async (item) => {
      const normalized = item.normalizedData as RegistrationNormalizedTeam | null;
      if (!normalized) throw new Error("Item import tidak memiliki data normalisasi.");

      const explicitEmail = normalized.captainEmail?.trim().toLowerCase();
      const email = explicitEmail || generateSyntheticRegistrationEmail(batch.event.slug, normalized.teamTag, usedEmails);
      if (explicitEmail) usedEmails.add(explicitEmail);

      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, role: true, name: true },
      });
      if (existingUser && existingUser.role !== "captain") {
        throw new Error("Email kapten sudah dipakai akun non-captain.");
      }
      if (existingUser) {
        return { item, normalized, captainId: existingUser.id, email, tempPassword: null };
      }

      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      return { item, normalized, captainId: null, email, tempPassword, passwordHash };
    }),
  );

  const credentials: Array<{
    teamName: string;
    teamTag: string;
    captainName: string;
    captainContact: string;
    email: string;
    tempPassword: string;
  }> = [];

  const committed = await runSerializableRegistrationTransaction(async (tx) => {
    credentials.length = 0;
    const claim = await tx.registrationImportBatch.updateMany({
      where: { id: batch.id, status: batch.status, committedAt: null },
      data: { committedAt: new Date() },
    });
    if (claim.count === 0) return false;
    await assertEventRosterMutable(tx, batch.eventId);

    const additionalTeams = prepared.filter((row) => row.item.status === "new").length;
    const [activeTeamCount, pendingReviewCount] = await Promise.all([
      tx.team.count({ where: { eventId: batch.eventId } }),
      tx.teamRegistrationRequest.count({ where: { eventId: batch.eventId, status: "pending_review" } }),
    ]);
    if (
      typeof batch.event.participantCap === "number"
      && activeTeamCount + pendingReviewCount + additionalTeams > batch.event.participantCap
    ) {
      throw new Error("Slot pendaftaran event ini tidak cukup untuk seluruh tim import yang dipilih.");
    }

    for (const row of prepared) {
      let captainId = row.captainId;
      if (!captainId) {
        const captain = await tx.user.create({
          data: {
            email: row.email,
            name: row.normalized.captainName,
            role: "captain",
            passwordHash: row.passwordHash!,
            tempPassword: row.tempPassword,
          },
        });
        captainId = captain.id;
        credentials.push({
          teamName: row.normalized.teamName,
          teamTag: row.normalized.teamTag,
          captainName: row.normalized.captainName,
          captainContact: row.normalized.captainContact,
          email: row.email,
          tempPassword: row.tempPassword!,
        });
      }

      let teamId = row.item.teamId ?? "";
      const teamData = {
        eventId: batch.eventId,
        captainId,
        name: row.normalized.teamName,
        logoText: row.normalized.teamTag.slice(0, 2).toUpperCase(),
        tag: row.normalized.teamTag.toUpperCase(),
        captainName: row.normalized.captainName,
        captainContact: row.normalized.captainContact,
        captainIgn: row.normalized.captainIgn,
        captainUid: row.normalized.captainUid,
        captainIsPlayer: row.normalized.captainIsPlayer,
        source: "registration-intake",
      };

      if (row.item.status === "changed" && row.item.teamId) {
        const updated = await tx.team.update({
          where: { id: row.item.teamId },
          data: teamData,
        });
        teamId = updated.id;
        await tx.player.deleteMany({ where: { teamId } });
      } else {
        const created = await tx.team.create({ data: teamData });
        teamId = created.id;
      }

      if (row.normalized.players.length > 0) {
        await tx.player.createMany({
          data: row.normalized.players.map((player) => ({
            teamId,
            eventId: batch.eventId,
            displayName: player.displayName,
            nickname: player.nickname,
            position: player.position,
          })),
        });
      }

      await tx.registrationImportItem.update({
        where: { id: row.item.id },
        data: {
          selected: true,
          status: "imported",
          teamId,
          committedAt: new Date(),
        },
      });
    }

    await tx.registrationImportBatch.update({
      where: { id: batch.id },
      data: {
        status: "committed",
        committedAt: new Date(),
      },
    });
    return true;
  });

  if (!committed) return { importedCount: 0, credentials: [] };
  return { importedCount: prepared.length, credentials };
}
