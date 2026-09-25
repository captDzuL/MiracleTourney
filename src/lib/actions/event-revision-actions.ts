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
  type EventRevisionActor,
  getEventEditRevision,
  revokeEventRevisionPreviewTokens,
  saveEventEditRevision,
} from "@/lib/events/event-revision";
import { createEventVisualAsset, updatePublishedEventSlugAsAdmin } from "@/lib/platform/repository";
import { authorizeWorkspaceResource, type WorkspaceActor } from "@/lib/security/authorization";
import { safeEntityIdSchema } from "@/lib/security/request-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { withServerActionLog } from "@/lib/observability/logger";

const managerRoleSchema = z.enum(["organizer", "platform_admin", "admin"]);
const saveSchema = z.object({
  eventId: safeEntityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  mutationId: z.string().uuid(),
  draft: eventRevisionPatchSchema,
});
const revisionSchema = z.object({ revisionId: safeEntityIdSchema });
const previewSchema = revisionSchema.extend({ locale: z.enum(["id", "en"]) });

async function requireRevisionManager() {
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) throw new Error("Unauthorized");
  if (user.role === "organizer" && user.mustChangePassword) throw new Error("Password change required");
  return { user, actor: { id: user.id, role: managerRoleSchema.parse(user.role) } };
}

async function resolveRevisionWorkspaceAccess(user: WorkspaceActor, revisionId: string) {
  const revision = await getEventEditRevision({
    revisionId,
    actor: user as EventRevisionActor,
  });
  if (!revision) throw new Error("Not authorized");

  const access = authorizeWorkspaceResource(
    user as WorkspaceActor,
    { eventId: revision.eventId, ownerUserId: revision.event.organizerUserId },
    revision.event.organizerUserId,
  );
  if (!access.ok) throw new Error("Not authorized");
  return revision;
}

function assertEventWorkspaceAccess(user: WorkspaceActor, eventId: string) {
  const access = authorizeWorkspaceResource(user, { eventId }, null);
  if (!access.ok) throw new Error("Not authorized");
}

function refreshEventSurfaces(eventId?: string) {
  revalidateTag("events");
  revalidatePath("/", "layout");
  if (eventId) {
    revalidatePath("/organizer/events/" + eventId);
    revalidatePath("/admin/events/" + eventId);
  }
}

async function savePublishedEventRevisionActionImpl(input: unknown) {
  const { actor } = await requireRevisionManager();
  const parsed = saveSchema.parse(input);
  await resolveRevisionWorkspaceAccess(actor, parsed.eventId);
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

async function applyPublishedEventRevisionActionImpl(input: unknown) {
  const { actor } = await requireRevisionManager();
  const parsed = revisionSchema.parse(input);
  await resolveRevisionWorkspaceAccess(actor, parsed.revisionId);
  const result = await applyEventEditRevision({ revisionId: parsed.revisionId, actor });
  if (result.status === "applied") refreshEventSurfaces(result.eventId);
  return result;
}

async function discardPublishedEventRevisionActionImpl(input: unknown) {
  const { actor } = await requireRevisionManager();
  const parsed = revisionSchema.parse(input);
  await resolveRevisionWorkspaceAccess(actor, parsed.revisionId);
  const result = await discardEventEditRevision({ revisionId: parsed.revisionId, actor });
  if (result.status === "discarded") refreshEventSurfaces(result.eventId);
  return result;
}

async function createPublishedRevisionPreviewActionImpl(input: unknown) {
  const { actor } = await requireRevisionManager();
  const parsed = previewSchema.parse(input);
  await resolveRevisionWorkspaceAccess(actor, parsed.revisionId);
  const result = await createEventRevisionPreviewToken({ revisionId: parsed.revisionId, actor });
  if (result.status !== "created") return result;
  return {
    status: result.status,
    url: `/${parsed.locale}/preview/events/${result.token}`,
    expiresAt: result.expiresAt,
  };
}

async function revokePublishedRevisionPreviewActionImpl(input: unknown) {
  const { actor } = await requireRevisionManager();
  const parsed = revisionSchema.parse(input);
  await resolveRevisionWorkspaceAccess(actor, parsed.revisionId);
  return revokeEventRevisionPreviewTokens({ revisionId: parsed.revisionId, actor });
}


async function uploadPublishedRevisionVisualActionImpl(formData: FormData) {
  const { user, actor } = await requireRevisionManager();
  const input = z.object({
    eventId: safeEntityIdSchema,
    revisionId: safeEntityIdSchema,
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
  if (!(await checkRateLimit(`revision-visual:${user.id}:${input.eventId}`, 3, 15 * 60 * 1000))) {
    redirect(`${returnPath}?error=rate-limited#section-public`);
  }
  const revision = await resolveRevisionWorkspaceAccess(actor, input.revisionId);
  if (revision.eventId !== input.eventId) throw new Error("Not authorized");
  if (input.kind === "poster" && formData.get("rightsAttestation") !== "confirmed") {
    redirect(`${returnPath}?error=${encodeURIComponent("Konfirmasi hak publikasi artwork terlebih dahulu.")}#section-public`);
  }
  if (revision.status !== "Draft") redirect(`${returnPath}?error=revision-not-editable#section-public`);
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


async function updatePublishedEventSlugActionImpl(formData: FormData) {
  const { user } = await requireRevisionManager();
  if (user.role !== "platform_admin" && user.role !== "admin") throw new Error("Not authorized");
  const input = z.object({
    eventId: safeEntityIdSchema,
    locale: z.enum(["id", "en"]),
    slug: z.string().trim().min(3).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  }).parse({ eventId: formData.get("eventId"), locale: formData.get("locale"), slug: formData.get("slug") });
  assertEventWorkspaceAccess(user, input.eventId);
  await updatePublishedEventSlugAsAdmin(user, input.eventId, input.slug);
  refreshEventSurfaces(input.eventId);
  redirect(`/${input.locale}/admin/events/${input.eventId}/edit#section-identity`);
}

export async function savePublishedEventRevisionAction(input: unknown) {
  return withServerActionLog("event_revision_save", "/server-actions/event-revision/save", () => savePublishedEventRevisionActionImpl(input));
}

export async function applyPublishedEventRevisionAction(input: unknown) {
  return withServerActionLog("event_revision_apply", "/server-actions/event-revision/apply", () => applyPublishedEventRevisionActionImpl(input));
}

export async function discardPublishedEventRevisionAction(input: unknown) {
  return withServerActionLog("event_revision_discard", "/server-actions/event-revision/discard", () => discardPublishedEventRevisionActionImpl(input));
}

export async function createPublishedRevisionPreviewAction(input: unknown) {
  return withServerActionLog("event_revision_preview_create", "/server-actions/event-revision/preview", () => createPublishedRevisionPreviewActionImpl(input));
}

export async function revokePublishedRevisionPreviewAction(input: unknown) {
  return withServerActionLog("event_revision_preview_revoke", "/server-actions/event-revision/preview/revoke", () => revokePublishedRevisionPreviewActionImpl(input));
}

export async function uploadPublishedRevisionVisualAction(formData: FormData) {
  return withServerActionLog("event_revision_visual_upload", "/server-actions/event-revision/visual", () => uploadPublishedRevisionVisualActionImpl(formData));
}

export async function updatePublishedEventSlugAction(formData: FormData) {
  return withServerActionLog("event_revision_slug_update", "/server-actions/event-revision/slug", () => updatePublishedEventSlugActionImpl(formData));
}
