import { z } from "zod";
import { prisma } from "@/lib/platform/db";

export const DEFAULT_EVENT_TIMEZONE = "Asia/Jakarta";
const trimmedString = z.string().transform((value) => value.trim()).optional();
const nonemptyTrimmedString = z.string().trim().min(1).optional();
const nullableTrimmedString = z.string().transform((value) => value.trim() || null).nullable().optional();
const nullableDate = z.preprocess((value) => value === "" || value === null ? null : value, z.coerce.date().nullable().optional());
const participantCap = z.union([z.literal(8), z.literal(12), z.literal(16), z.literal(24), z.literal(32), z.literal(64), z.literal(128), z.literal(256)]);

export const eventDraftSchema = z.object({
  name: trimmedString, slug: nonemptyTrimmedString, description: trimmedString, gameId: trimmedString, gameModeId: trimmedString,
  format: z.enum(["Single Elimination", "League"]).optional(), participantCap: participantCap.optional(),
  registrationOpensAt: nullableDate, registrationClosesAt: nullableDate, eventStartsAt: nullableDate,
  timezone: nonemptyTrimmedString, venue: trimmedString, venueAddress: nullableTrimmedString,
  prizePoolLabel: nullableTrimmedString, registrationFeeRequired: z.boolean().optional(),
  registrationFeeAmount: z.number().int().nonnegative().nullable().optional(), registrationFeeLabel: nullableTrimmedString,
  registrationUrl: nullableTrimmedString, logoUrl: nullableTrimmedString, gameImageUrl: nullableTrimmedString,
  characterArtUrl: nullableTrimmedString, accentColor: nullableTrimmedString,
}).strict();

export type EventDraftPatch = z.infer<typeof eventDraftSchema>;
export type EventDraftField = keyof EventDraftPatch;
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
function valuesMatch(current: Record<string, unknown>, patch: EventDraftPatch) {
  return (Object.entries(patch) as Array<[EventDraftField, unknown]>).every(([field, wanted]) => {
    const actual = current[field];
    return actual instanceof Date && wanted instanceof Date ? actual.getTime() === wanted.getTime() : actual === wanted;
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
  const draft = eventDraftSchema.parse(input.draft);
  const mutationId = z.string().uuid().parse(input.mutationId);
  const fields = fieldStates(draft, "saved");
  const organizerUserId = await ownerIdForActor(input.eventId, input.actor);
  const update = await prisma.event.updateMany({
    where: { id: input.eventId, organizerUserId, status: "Draft", draftRevision: input.expectedRevision },
    data: { ...draft, lastDraftMutationId: mutationId, draftRevision: { increment: 1 } },
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
  if (current.status !== "Draft") return { status: "not_editable", revision, fields: fieldStates(draft, "conflict") };
  return { status: "conflict", revision, fields: fieldStates(draft, "conflict") };
}

