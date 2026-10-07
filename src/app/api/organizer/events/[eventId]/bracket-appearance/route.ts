import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { uploadImageAsset } from "@/lib/actions";
import { requireAnyRole } from "@/lib/auth/session";
import { getBracketAppearance, saveBracketAppearance } from "@/lib/bracket/appearance";
import { prisma } from "@/lib/platform/db";
import { authorizeWorkspaceResource, type WorkspaceActor } from "@/lib/security/authorization";
import { isSafeEntityId, requireSameOrigin } from "@/lib/security/request-guard";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
const bounded = (max: number) => z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.number().int().min(0).max(max));
const settingsSchema = z.object({ positionX: bounded(100), positionY: bounded(100), overlay: bounded(80) });
type Context = { params: Promise<{ eventId: string }> };
function fail(code: string, status: number) { return Response.json({ code }, { status, headers }); }

async function access(context: Context) {
  const eventId = (await context.params).eventId;
  if (!isSafeEntityId(eventId)) return { response: fail("invalid_input", 400) };
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return { response: fail("unauthorized", 401) };
  if (user.role === "organizer" && user.mustChangePassword) return { response: fail("forbidden", 403) };
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, slug: true, organizerUserId: true } });
  const decision = authorizeWorkspaceResource(user as WorkspaceActor, event ? { eventId, ownerUserId: event.organizerUserId } : null, event?.organizerUserId ?? null);
  if (!decision.ok) return { response: fail("forbidden", 403) };
  return { user, event: event!, eventId };
}
function refresh(eventId: string, slug: string) {
  revalidateTag("events");
  for (const locale of ["id", "en"]) {
    revalidatePath(`/${locale}/events/${slug}/bracket`);
    revalidatePath(`/${locale}/organizer/events/${eventId}/competition`);
  }
  revalidatePath(`/events/${slug}/bracket`);
}
export async function GET(_request: Request, context: Context) {
  try {
    const gate = await access(context);
    if (gate.response) return gate.response;
    return Response.json(await getBracketAppearance(gate.eventId!), { headers });
  } catch { return fail("internal_error", 503); }
}
export async function POST(request: Request, context: Context) {
  const originFailure = requireSameOrigin(request);
  if (originFailure) return originFailure;
  try {
    const gate = await access(context);
    if (gate.response) return gate.response;
    const form = await request.formData();
    if (form.has("backgroundUrl")) return fail("invalid_input", 400);
    const action = form.get("action");
    if (action !== "save" && action !== "upload" && action !== "reset") return fail("invalid_input", 400);
    const parsed = settingsSchema.safeParse({ positionX: form.get("positionX"), positionY: form.get("positionY"), overlay: form.get("overlay") });
    if (!parsed.success) return fail("invalid_input", 400);
    let backgroundUrl: string | null | undefined;
    if (action === "upload") {
      if (form.get("rightsAttestation") !== "confirmed") return fail("rights_attestation_required", 400);
      let asset: Awaited<ReturnType<typeof uploadImageAsset>>;
      try {
        asset = await uploadImageAsset({ file: form.get("background"), folder: "bracket-backgrounds", entityId: gate.eventId!, label: "Bracket background", maxBytes: 5 * 1024 * 1024, validatePixels: true, validationMode: "throw" });
      } catch (error) {
        if (error instanceof Error && error.name === "ImageUploadValidationError" && "code" in error && typeof error.code === "string") return fail(error.code, 400);
        return fail("upload_failed", 503);
      }
      await prisma.eventVisualAsset.create({ data: {
        eventId: gate.eventId!, createdByUserId: gate.user!.id, source: "organizer_upload", status: "approved", purpose: "bracket_background",
        url: asset.url, mimeType: asset.mimeType, width: asset.width, height: asset.height, byteSize: asset.byteSize,
        storageProvider: asset.storageProvider, storageKey: asset.storageKey, contentSha256: asset.contentSha256,
        rightsAttestedAt: new Date(), approvedAt: new Date(),
      } });
      backgroundUrl = asset.url;
    } else if (action === "reset") backgroundUrl = null;
    const saved = await saveBracketAppearance(gate.eventId!, parsed.data, backgroundUrl);
    refresh(gate.eventId!, gate.event!.slug);
    return Response.json(saved, { headers });
  } catch { return fail("internal_error", 503); }
}
