"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { uploadImageAsset } from "@/lib/actions";
import { requireAnyRole } from "@/lib/auth/session";
import {
  applyEventEditRevision,
  createEventRevisionPreviewToken,
  discardEventEditRevision,
  eventRevisionPatchSchema,
  getEventEditRevision,
  revokeEventRevisionPreviewTokens,
  saveEventEditRevision,
} from "@/lib/events/event-revision";
import { createEventVisualAsset, updatePublishedEventSlugAsAdmin } from "@/lib/platform/repository";

const managerRoleSchema = z.enum(["organizer", "platform_admin", "admin"]);
const saveSchema = z.object({
  eventId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  mutationId: z.string().uuid(),
  draft: eventRevisionPatchSchema,
});
const revisionSchema = z.object({ revisionId: z.string().min(1) });
const previewSchema = revisionSchema.extend({ locale: z.enum(["id", "en"]) });

async function requireRevisionManager() {
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) throw new Error("Unauthorized");
  if (user.role === "organizer" && user.mustChangePassword) throw new Error("Password change required");
  return { user, actor: { id: user.id, role: managerRoleSchema.parse(user.role) } };
}

function refreshEventSurfaces(eventId?: string) {
  revalidateTag("events");
  revalidatePath("/", "layout");
  if (eventId) {
    revalidatePath("/organizer/events/" + eventId);
    revalidatePath("/admin/events/" + eventId);
  }
}

export async function savePublishedEventRevisionAction(input: unknown) {
  const { actor } = await requireRevisionManager();
  const parsed = saveSchema.parse(input);
  const result = await saveEventEditRevision({
    revisionId: parsed.eventId,
    actor,
    expectedRevision: parsed.expectedRevision,
    mutationId: parsed.mutationId,
    patch: parsed.draft,
  });
  if (result.status === "saved") refreshEventSurfaces();
  return result;
}

export async function applyPublishedEventRevisionAction(input: unknown) {
  const { actor } = await requireRevisionManager();
  const parsed = revisionSchema.parse(input);
  const result = await applyEventEditRevision({ revisionId: parsed.revisionId, actor });
  if (result.status === "applied") refreshEventSurfaces(result.eventId);
  return result;
}

export async function discardPublishedEventRevisionAction(input: unknown) {
  const { actor } = await requireRevisionManager();
  const parsed = revisionSchema.parse(input);
  const result = await discardEventEditRevision({ revisionId: parsed.revisionId, actor });
  if (result.status === "discarded") refreshEventSurfaces(result.eventId);
  return result;
}

export async function createPublishedRevisionPreviewAction(input: unknown) {
  const { actor } = await requireRevisionManager();
  const parsed = previewSchema.parse(input);
  const result = await createEventRevisionPreviewToken({ revisionId: parsed.revisionId, actor });
  if (result.status !== "created") return result;
  return {
    status: result.status,
    url: `/${parsed.locale}/preview/events/${result.token}`,
    expiresAt: result.expiresAt,
  };
}

export async function revokePublishedRevisionPreviewAction(input: unknown) {
  const { actor } = await requireRevisionManager();
  const parsed = revisionSchema.parse(input);
  return revokeEventRevisionPreviewTokens({ revisionId: parsed.revisionId, actor });
}


export async function uploadPublishedRevisionVisualAction(formData: FormData) {
  const { user, actor } = await requireRevisionManager();
  const input = z.object({
    eventId: z.string().min(1),
    revisionId: z.string().min(1),
    locale: z.enum(["id", "en"]),
    kind: z.enum(["logo", "poster"]),
  }).parse({
    eventId: formData.get("eventId"),
    revisionId: formData.get("revisionId"),
    locale: formData.get("locale"),
    kind: formData.get("kind"),
  });
  const basePath = user.role === "organizer" ? "organizer" : "admin";
  const returnPath = `/${input.locale}/${basePath}/events/${input.eventId}/edit`;
  const returnTarget = `${returnPath}#section-public`;
  if (input.kind === "poster" && formData.get("rightsAttestation") !== "confirmed") {
    redirect(`${returnPath}?error=${encodeURIComponent("Konfirmasi hak publikasi artwork terlebih dahulu.")}#section-public`);
  }
  const revision = await getEventEditRevision({ revisionId: input.revisionId, actor });
  if (!revision || revision.status !== "Draft") redirect(`${returnPath}?error=revision-not-editable#section-public`);
  const file = formData.get(input.kind === "poster" ? "revisionPoster" : "revisionLogo");
  const asset = await uploadImageAsset({
    file,
    folder: input.kind === "poster" ? "event-revision-backgrounds" : "event-revision-logos",
    entityId: input.revisionId,
    label: input.kind === "poster" ? "Event revision poster" : "Event revision logo",
    maxBytes: 2 * 1024 * 1024,
    errorPath: returnTarget,
  });
  let patch: Record<string, unknown> = input.kind === "poster"
    ? { gameImageUrl: asset.url }
    : { logoUrl: asset.url };
  if (input.kind === "poster") {
    const staged = await createEventVisualAsset(user, {
      eventId: input.eventId, source: "organizer_upload", status: "approved",
      url: asset.url, mimeType: asset.mimeType, width: asset.width, height: asset.height,
      rightsAttestedAt: new Date(),
    });
    patch = { ...patch, activeVisualAssetId: staged.id };
  }
  const result = await saveEventEditRevision({
    revisionId: input.revisionId, actor, expectedRevision: revision.revision,
    mutationId: randomUUID(), patch,
  });
  if (result.status !== "saved") redirect(`${returnPath}?error=${encodeURIComponent("Aset tersimpan tetapi revisi berubah. Muat ulang dan coba lagi.")}#section-public`);
  refreshEventSurfaces(input.eventId);
  redirect(returnTarget);
}


export async function updatePublishedEventSlugAction(formData: FormData) {
  const { user } = await requireRevisionManager();
  if (user.role !== "platform_admin" && user.role !== "admin") throw new Error("Not authorized");
  const input = z.object({
    eventId: z.string().min(1),
    locale: z.enum(["id", "en"]),
    slug: z.string().trim().min(3).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  }).parse({ eventId: formData.get("eventId"), locale: formData.get("locale"), slug: formData.get("slug") });
  await updatePublishedEventSlugAsAdmin(user, input.eventId, input.slug);
  refreshEventSurfaces(input.eventId);
  redirect(`/${input.locale}/admin/events/${input.eventId}/edit#section-identity`);
}
