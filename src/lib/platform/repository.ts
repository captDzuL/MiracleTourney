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
export { createCaptainAccount, getCaptainById, getCaptainUsersForAdmin, getOrganizerUserById, getOrganizerUsers, getUserByEmail, getUserPasswordHashById, getUserWithPasswordByEmail, hasTempPassword, updateCaptainPassword, updateUserPassword } from "@/lib/identity/repository";

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

// ── Import snapshot ───────────────────────────────────────────────────────────

// ── Mutations ─────────────────────────────────────────────────────────────────

// ── Stat Submissions (captain) ────────────────────────────────────────────────

// ── Stat Submissions (admin) ──────────────────────────────────────────────────

// ── Captain self sign-up ──────────────────────────────────────────────────────

// ── Round config (Best of N) ──────────────────────────────────────────────────

// ── Match games (Best of N results) ──────────────────────────────────────────

// ── Certificates ──────────────────────────────────────────────────────────────

