import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/platform/db";
import { getLegacyTournamentFormat, tournamentFormatConfigSchema } from "@/lib/tournament/formats/types";

export const DEFAULT_EVENT_TIMEZONE = "Asia/Jakarta";
const trimmedString = z.string().transform((value) => value.trim()).optional();
const nonemptyTrimmedString = z.string().trim().min(1).optional();
const nullableTrimmedString = z.string().transform((value) => value.trim() || null).nullable().optional();
const nullableDate = z.preprocess((value) => value === "" || value === null ? null : value, z.coerce.date().nullable().optional());
const participantCap = z.union([z.literal(8), z.literal(12), z.literal(16), z.literal(24), z.literal(32), z.literal(64), z.literal(128), z.literal(256)]);
const eventTimezone = z.preprocess(
  (value) => typeof value === "string" ? value.trim() : value,
  z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]),
);

export const eventDraftSchema = z.object({
  name: trimmedString, slug: nonemptyTrimmedString, description: trimmedString, gameId: trimmedString, gameModeId: trimmedString,
  format: z.enum(["Single Elimination", "League"]).optional(), formatConfig: tournamentFormatConfigSchema.optional(),
  participantCap: participantCap.optional(),
  registrationOpensAt: nullableDate, registrationClosesAt: nullableDate, eventStartsAt: nullableDate,
  timezone: eventTimezone.optional(), venue: trimmedString, venueAddress: nullableTrimmedString,
  prizePoolLabel: nullableTrimmedString, registrationFeeRequired: z.boolean().optional(),
  registrationFeeAmount: z.number().int().nonnegative().nullable().optional(), registrationFeeLabel: nullableTrimmedString,
  registrationUrl: nullableTrimmedString, logoUrl: nullableTrimmedString, gameImageUrl: nullableTrimmedString,
  characterArtUrl: nullableTrimmedString, accentColor: nullableTrimmedString,
}).strict().superRefine((draft, context) => {
  if (draft.formatConfig && draft.format && draft.format !== getLegacyTournamentFormat(draft.formatConfig)) {
    context.addIssue({ code: "custom", path: ["formatConfig"], message: "V3 format config must match the legacy format" });
  }
});

export type EventDraftPatch = z.infer<typeof eventDraftSchema>;
export type EventDraftField = keyof EventDraftPatch;
type NormalizedEventDraftPatch = Omit<EventDraftPatch, "formatConfig"> & {
  formatConfig?: EventDraftPatch["formatConfig"] | null;
};
export type EventDraftActor = { id: string; role: "organizer" | "admin" | "platform_admin" };
type FieldSaveState = { state: "saved" | "conflict" };
export type SaveEventDraftResult =
  | { status: "saved"; revision: number; retry?: true; fields: Partial<Record<EventDraftField, FieldSaveState>> }
  | { status: "conflict" | "not_editable"; revision: number; fields: Partial<Record<EventDraftField, FieldSaveState>> };

const comparableFieldNames = Object.keys(eventDraftSchema.shape) as EventDraftField[];
const currentDraftSelect = Object.fromEntries(
  ["draftRevision", "lastDraftMutationId", "status", ...comparableFieldNames].map((field) => [field, true]),
);
function fieldStates(draft: EventDraftPatch, state: FieldSaveState["state"]) {
  return Object.fromEntries((Object.keys(draft) as EventDraftField[]).map((field) => [field, { state }])) as Partial<Record<EventDraftField, FieldSaveState>>;
}
function valuesMatch(current: Record<string, unknown>, patch: NormalizedEventDraftPatch) {
  return Object.entries(patch).every(([field, wanted]) => {
    const actual = current[field];
    return actual instanceof Date && wanted instanceof Date
      ? actual.getTime() === wanted.getTime()
      : isDeepStrictEqual(actual, wanted);
  });
}async function ownerIdForActor(eventId: string, actor: EventDraftActor) {
  if (actor.role === "organizer") return actor.id;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { organizerUserId: true } });
  if (!event) throw new Error("Event not found");
  return event.organizerUserId;
}

export async function saveEventDraft(input: {
  eventId: string; actor: EventDraftActor; expectedRevision: number; mutationId: string; draft: unknown;
}): Promise<SaveEventDraftResult> {
  const parsedDraft = eventDraftSchema.parse(input.draft);
  const draft: NormalizedEventDraftPatch = parsedDraft.formatConfig
    ? { ...parsedDraft, format: getLegacyTournamentFormat(parsedDraft.formatConfig) }
    : parsedDraft.format
      ? { ...parsedDraft, formatConfig: null }
    : parsedDraft;
  const mutationId = z.string().uuid().parse(input.mutationId);
  const fields = fieldStates(parsedDraft, "saved");
  const organizerUserId = await ownerIdForActor(input.eventId, input.actor);
  const { formatConfig, ...draftFields } = draft;
  const persistedDraft: Prisma.EventUpdateManyMutationInput = {
    ...draftFields,
    ...(formatConfig === null
      ? { formatConfig: Prisma.DbNull }
      : formatConfig === undefined ? {} : { formatConfig }),
  };
  const update = await prisma.event.updateMany({
    where: { id: input.eventId, organizerUserId, status: "Draft", draftRevision: input.expectedRevision },
    data: { ...persistedDraft, lastDraftMutationId: mutationId, draftRevision: { increment: 1 } },
  });
  if (update.count === 1) return { status: "saved", revision: input.expectedRevision + 1, fields };

  const current = await prisma.event.findFirst({
    where: { id: input.eventId, organizerUserId }, select: currentDraftSelect,
  }) as unknown as Record<string, unknown> | null;
  if (!current) throw new Error("Event not found or not owned by organizer");

  const revision = z.number().int().nonnegative().parse(current.draftRevision);
  const provenRetry = revision === input.expectedRevision + 1
    && current.lastDraftMutationId === mutationId
    && valuesMatch(current, draft);
  if (provenRetry) return { status: "saved", revision, retry: true, fields };
  if (current.status !== "Draft") return { status: "not_editable", revision, fields: fieldStates(parsedDraft, "conflict") };
  return { status: "conflict", revision, fields: fieldStates(parsedDraft, "conflict") };
}

