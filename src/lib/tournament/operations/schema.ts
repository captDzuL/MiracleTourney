import { z } from "zod";
import { tournamentFormatConfigSchema } from "../formats/types";

const id = z.string().trim().min(1).max(300);
const reason = z.string().trim().max(4000).optional();
const instant = z.iso.datetime({ offset: true });
const urgency = z.enum(["info", "important", "urgent"]);
const assignment = z.object({ matchId: id, roomId: id, start: instant, end: instant }).strict();
const drawingTeams = z.array(z.object({
  id,
  seed: z.number().int().positive(),
}).strict()).min(2);
export const resultGamesSchema = z.array(z.object({ gameNumber: z.number().int().positive(), homeScore: z.number().int().nonnegative().max(2147483647), awayScore: z.number().int().nonnegative().max(2147483647) }).strict()).max(999);
export const correctionPreviewSchema = z.object({ eventId: id, matchId: id, games: resultGamesSchema }).strict();
const scheduling = z.object({
  timezone: id, eventWindow: z.object({ start: instant, end: instant }).strict(),
  matchDurationMinutes: z.number(), bufferMinutes: z.number(), minimumRestMinutes: z.number(),
  preferredRestMinutes: z.number().optional(), rooms: z.array(id), manualOverrides: z.array(assignment).optional(),
  lockedMatchIds: z.array(id).optional(),
  sourceRevision: z.object({ id, version: z.number().int().positive(), status: z.enum(["draft", "published"]) }).strict().optional(),
}).strict();
export const internalOperationCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("legacy_upgrade") }).strict(),
  z.object({ kind: z.literal("delay_preview"), matchId: id, estimatedEnd: instant, sourceRevision: z.object({ id, version: z.number().int().positive(), status: z.enum(["draft", "published"]) }).strict().optional(), reason: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ kind: z.literal("initialize"), config: tournamentFormatConfigSchema, teams: z.array(z.object({ id, seed: z.number().int() }).strict()), slotCount: z.number().int().optional() }).strict(),
  z.object({ kind: z.literal("drawing_save"), config: tournamentFormatConfigSchema, teams: drawingTeams, slotCount: z.number().int().positive().optional() }).strict(),
  z.object({ kind: z.literal("drawing_publish") }).strict(),
  z.object({ kind: z.literal("drawing_reset") }).strict(),
  z.object({ kind: z.literal("schedule_save"), input: scheduling, reason }).strict(),
  z.object({ kind: z.literal("schedule_publish"), revisionId: id }).strict(),
  z.object({ kind: z.literal("match_timing"), matchId: id, status: z.enum(["delayed", "postponed"]), reason }).strict(),
  z.object({ kind: z.literal("readiness_update"), matchId: id, teamId: id, status: z.enum(["pending", "checked_in", "ready", "not_ready"]), note: z.string().trim().max(4000).optional() }).strict(),
  z.object({ kind: z.literal("readiness_deadline"), matchId: id }).strict(),
  z.object({ kind: z.literal("match_start"), matchId: id, reason }).strict(),
  z.object({ kind: z.literal("result_submit"), matchId: id, games: resultGamesSchema }).strict(),
  z.object({ kind: z.literal("result_correct"), matchId: id, games: resultGamesSchema, reason: z.string().trim().min(1).max(4000), previewToken: id }).strict(),
  z.object({ kind: z.literal("incident_report"), matchId: id.optional(), incidentKind: id, description: z.string().trim().min(1).max(8000) }).strict(),
  z.object({ kind: z.literal("incident_resolve"), incidentId: id, reason }).strict(),
  z.object({ kind: z.literal("action_resolve"), actionId: id, reason }).strict(),
  z.object({ kind: z.literal("announcement_save"), announcementId: id.optional(), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(8000), urgency: urgency.optional(), startsAt: instant.optional(), endsAt: instant.optional() }).strict(),
  z.object({ kind: z.literal("announcement_publish"), announcementId: id, urgency: urgency.optional() }).strict(),
  z.object({ kind: z.literal("announcement_unpublish"), announcementId: id }).strict(),
]);
export const operationCommandSchema = internalOperationCommandSchema.refine(
  (command) => command.kind !== "initialize",
  { message: "initialize is internal; use drawing_save then drawing_publish" },
);
export const operationRequestSchema = z.object({ eventId: id, expectedVersion: z.number().int().nonnegative(), idempotencyKey: id, command: operationCommandSchema }).strict();
export const internalOperationRequestSchema = z.object({ eventId: id, expectedVersion: z.number().int().nonnegative(), idempotencyKey: id, command: internalOperationCommandSchema }).strict();
export type ParsedCommand = z.infer<typeof internalOperationCommandSchema>;
