import type { AppUser } from "@/lib/platform/types";
import { UserFacingError } from "@/lib/security/public-error";
import { prisma } from "./db";
import { mapUser } from "./shared/mappers";
export { runSerializableRegistrationTransaction } from "./shared/tx";
export { assertUserCanManageEvent, assertUserCanManageTeam, assertUserCanReviewStatSubmission } from "./shared/authz";
export { eventPublicInclude, mapEvent } from "./shared/mappers";
export { getAllGames, getGameForEvent, getGameModes, getModeForEvent, getOrganizerProfileForUser, getPaymentSettings, getPlatformProfile, updateOrganizerProfileForUser, updatePaymentSettings, updatePlatformProfile } from "@/lib/platform/settings-repository";
export type { OrganizerProfileSummary, PlatformProfileSummary } from "@/lib/platform/settings-repository";
export { autoTransitionEventToOngoing, createEvent, createOrganizerAndEventDraft, getAllPublicEvents, getEventBySlug, getEvents, getEventsByIds, getManageableEventDraft, getManageableEventsForUser, getOpenRegistrationEventsForCaptain, getPublicDiscoveryEvents, getPublicEventBySlug, getPublicEventSlugRedirect, getPublicEvents, getPublishedEvents, setEventStatus, updateEventOrganizerContact, updateEventPublicInfo, updateEventStream, updatePublishedEventSlugAsAdmin } from "@/lib/events/repository";
export type { CreateOrganizerAndEventDraftInput, EventPublicInfoUpdates } from "@/lib/events/repository";
export { approveEventVisualAsset, countAiVisualAttempts, createEventVisualAsset, listEventVisualAssets, rejectEventVisualAsset, setEventVisualFocalPoint, updateEventBrandAssets, updateEventCertificateAssets } from "@/lib/events/visual-repository";
export type { CreateEventVisualAssetInput } from "@/lib/events/visual-repository";
export { addPlayer, deletePlayer, getCaptainTeams, getPlayersForEvent, getPlayersForTeam, getPlayersForTeams, getTeamCountsForEvents, getTeamsForEvent, getTeamsForEvents, setTeamCaptainDisplay, updateCaptainTeamLogo, updatePlayer, updateTeamLogo } from "@/lib/teams/repository";
export { getBracketManageableMatches, getBracketManageableMatchesForEvent, getBracketPreview, getLeaderboardForEvent, getMatchesForEvent, getPublicVisibleBracketPreview, getTeamStandings, isEventBracketLocked, setMatchResult } from "@/lib/bracket/repository";
export { getEventRoundConfigs, getMatchGames, getMatchGamesForEvent, setMatchGames, upsertRoundConfig } from "@/lib/bracket/rounds-repository";
export { RegistrationMutationConflictError, createOrUpdateCaptainDraftTeam, createTeamRegistrationRequest, getCaptainRegistrationRequests, getPaymentRegistrationRequestsForAdmin, getRosterChangeWindow, readRosterChangeState, registerTeam, updateTeamRegistrationProof } from "@/lib/registration/repository";
export type { RegistrationReviewPrecondition } from "@/lib/registration/repository";
export { PaymentReviewOverflowError, approveTeamRegistrationRequest, getEventPaymentSettingsForManager, getPaymentReviewForEvent, getTeamRegistrationRequestForEvent, rejectTeamRegistrationRequest } from "@/lib/registration/review-repository";
export type { EventPaymentManagerSettings, PaymentReviewEntry, TeamRegistrationRequestTarget } from "@/lib/registration/review-repository";
export { commitRegistrationImportBatch, getCaptainCredentialsForEvent, getImportSnapshot, getImportedTeams, getRegistrationImportBatchForAdmin, getRegistrationImportBatchesForEvent, getRegistrationImportEventContext, getRegistrationImportHistoryForEvent, getRegistrationImportUsersByEmails, getRegistrationRecordsForEvent, importTeams, saveRegistrationImportPreviewBatch } from "@/lib/imports/repository";
export type { RegistrationImportEventContext, RegistrationImportHistoryEntry } from "@/lib/imports/repository";
export { assertCaptainCanSubmitStats, getCompletedMatchesForCaptain, getFlashpeakLeaderboardForEvent, getFlashpeakLeaderboardForEventResult, getPlayerStatFormContext } from "@/lib/player-stats/repository";
export type { CompletedMatchRow, FlashpeakLeaderboardReadResult, PlayerStatFormContext } from "@/lib/player-stats/repository";
export { adminWriteMatchPlayerStats, approveStatSubmission, getMatchWithRosterAndStats, getPendingStatSubmissionCount, getPendingStatSubmissions, readEventMatchStatistics, rejectStatSubmission, upsertStatSubmission } from "@/lib/player-stats/write-repository";
export type { EventMatchStatistics, PlayerStatWriteGuard, StatSubmissionRow } from "@/lib/player-stats/write-repository";
export { countCertificatesForGame, getCertificateByEvent, getCertificatesForEvents, recordCertificateFailure, recordCertificateSuccess } from "@/lib/certificate/repository";

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Credential helpers ────────────────────────────────────────────────────────

// ── Static config ─────────────────────────────────────────────────────────────

// ── Events ────────────────────────────────────────────────────────────────────

// ── Event visual assets ───────────────────────────────────────────────────────


// ── Teams ─────────────────────────────────────────────────────────────────────

// ── Players ───────────────────────────────────────────────────────────────────

// ── Matches ───────────────────────────────────────────────────────────────────

// ── Bracket helpers (copied from demo-store, now async) ───────────────────────

// ── Leaderboard / standings ───────────────────────────────────────────────────

// ── Bracket preview ───────────────────────────────────────────────────────────

// ── Users ─────────────────────────────────────────────────────────────────────

/** Looks up a user by ID. Returns null for undefined input or missing records. Used by session resolution. */
export async function getCaptainById(userId: string | undefined): Promise<AppUser | null> {
  if (!userId) return null;
  const row = await prisma.user.findUnique({ where: { id: userId } });
  if (!row) return null;
  return mapUser(row);
}

/** Lists organizer accounts that platform admins can assign as event owners. */
export async function getOrganizerUsers(): Promise<AppUser[]> {
  const rows = await prisma.user.findMany({
    where: { role: "organizer" },
    orderBy: { name: "asc" },
    select: { id: true, email: true, name: true, role: true },
  });
  return rows.map(mapUser);
}

/** Looks up one organizer account for server-side event ownership assignment. */
export async function getOrganizerUserById(userId: string): Promise<AppUser | null> {
  const row = await prisma.user.findFirst({
    where: { id: userId, role: "organizer" },
    select: { id: true, email: true, name: true, role: true },
  });
  return row ? mapUser(row) : null;
}

/** Looks up a user by email without exposing the password hash. For duplicate-email checks and session resolution. */
export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const row = await prisma.user.findUnique({ where: { email } });
  if (!row) return null;
  return mapUser(row);
}

/** Fetches user with passwordHash included. Only used by the sign-in flow for bcrypt comparison. */
export async function getUserWithPasswordByEmail(email: string): Promise<(AppUser & { passwordHash: string }) | null> {
  const row = await prisma.user.findUnique({ where: { email } });
  if (!row) return null;
  return { ...mapUser(row), passwordHash: row.passwordHash };
}

/** Fetches only the password hash for the change-password flow. Returns null if user not found. */
export async function getUserPasswordHashById(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  return row?.passwordHash ?? null;
}

/** Returns all captain-role users, for admin assignment dropdown. */
export async function getCaptainUsersForAdmin() {
  return prisma.user.findMany({
    where: { role: "captain" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

/** Returns true if the user still has a temporary password set from a CSV import. Used to prompt password change on first login. */
export async function hasTempPassword(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { tempPassword: true } });
  return row?.tempPassword != null;
}

/** Updates a password hash and clears any first-login lock without retaining the temporary secret. */
export async function updateUserPassword(userId: string, newHash: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash, tempPassword: null, mustChangePassword: false } as never,
  });
}

/** Legacy captain alias retained for current captain settings and imports. */
export async function updateCaptainPassword(userId: string, newHash: string): Promise<void> {
  await updateUserPassword(userId, newHash);
}
// ── Import snapshot ───────────────────────────────────────────────────────────

// ── Mutations ─────────────────────────────────────────────────────────────────

// ── Stat Submissions (captain) ────────────────────────────────────────────────

// ── Stat Submissions (admin) ──────────────────────────────────────────────────

// ── Captain self sign-up ──────────────────────────────────────────────────────

const EMAIL_ALREADY_REGISTERED_MESSAGE = "Email ini sudah terdaftar. Coba login.";

/** Creates a captain User without requiring an active event or team registration. */
export async function createCaptainAccount(input: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<{ userId: string }> {
  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: "captain",
        passwordHash: input.passwordHash,
      },
    });
    return { userId: user.id };
  } catch (error) {
    // The only unique column on User that this write can hit is the email.
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "P2002") throw new UserFacingError(EMAIL_ALREADY_REGISTERED_MESSAGE);
    throw error;
  }
}

// ── Round config (Best of N) ──────────────────────────────────────────────────

// ── Match games (Best of N results) ──────────────────────────────────────────

// ── Certificates ──────────────────────────────────────────────────────────────

