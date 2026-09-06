"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { requireAnyRole } from "@/lib/auth/session";
import { eventDraftSchema, saveEventDraft } from "@/lib/events/event-draft";
import { publishEvent } from "@/lib/events/publish-readiness";
import { assertUserCanManageEvent } from "@/lib/platform/repository";

const saveDraftActionSchema = z.object({
  eventId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  mutationId: z.string().uuid(),
  draft: eventDraftSchema,
});
const publishActionSchema = z.object({ eventId: z.string().min(1) });
const eventManagerRoleSchema = z.enum(["organizer", "platform_admin", "admin"]);

async function requireEventManager() {
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) throw new Error("Unauthorized");
  return {
    user,
    actor: { id: user.id, role: eventManagerRoleSchema.parse(user.role) },
  };
}

export async function saveEventDraftAction(input: unknown) {
  const { actor } = await requireEventManager();
  const parsed = saveDraftActionSchema.parse(input);
  const result = await saveEventDraft({
    eventId: parsed.eventId,
    actor,
    expectedRevision: parsed.expectedRevision,
    mutationId: parsed.mutationId,
    draft: parsed.draft,
  });

  if (result.status === "saved") {
    revalidateTag("events");
    revalidatePath("/organizer/events/" + parsed.eventId);
  }
  return result;
}

export async function publishEventV3Action(input: unknown) {
  const { user, actor } = await requireEventManager();
  const parsed = publishActionSchema.parse(input);
  await assertUserCanManageEvent(user, parsed.eventId);
  const result = await publishEvent(parsed.eventId, actor);

  if (result.status === "published") {
    revalidateTag("events");
    revalidatePath("/", "layout");
    revalidatePath("/organizer/events/" + parsed.eventId);
  }
  return result;
}


