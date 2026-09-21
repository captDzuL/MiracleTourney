"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireRole } from "@/lib/auth/session";
import {
  createTeamRegistrationRequest,
  getEventBySlug,
  registerTeam,
} from "@/lib/platform/repository";
import { saveCaptainRegistrationDraft } from "@/lib/registration/captain-repository";
import { authorizeWorkspaceResource, type WorkspaceActor } from "@/lib/security/authorization";
import { toSafeActionMessage } from "@/lib/security/public-error";
import { safeEntityIdSchema } from "@/lib/security/request-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { withServerActionLog } from "@/lib/observability/logger";

const registrationSchema = z.object({
  eventId: safeEntityIdSchema,
  eventSlug: z.string().trim().regex(/^[a-z0-9-]+$/),
  draftTeamId: safeEntityIdSchema.optional(),
  name: z.string().trim().min(2),
  tag: z.string().trim().min(2).max(5),
  captainIgn: z.string().trim().min(2),
  captainUid: z.string().trim().min(2),
  captainContact: z.string().trim().min(6),
});

const paidEventError =
  "Event ini membutuhkan verifikasi pembayaran sebelum tim aktif.";

function getStringValues(formData: FormData, field: string) {
  return formData
    .getAll(field)
    .map((value) => (typeof value === "string" ? value.trim() : ""));
}

function getCaptainId(captain: unknown) {
  const record = captain as {
    id?: unknown;
    user?: { id?: unknown };
  };
  const id = record.id ?? record.user?.id;

  return typeof id === "string" ? id : null;
}

function registrationErrorPath(eventSlug: string, error: string) {
  return `/events/${eventSlug}/register?error=${encodeURIComponent(error)}`;
}

async function captainRegisterEventTeamActionImpl(formData: FormData) {
  const captain = await requireRole("captain");

  if (!captain) {
    return redirectToActiveLocale("/login");
  }

  const captainId = getCaptainId(captain);
  if (!captainId) {
    return redirectToActiveLocale("/login");
  }

  const eventSlug = formData.get("eventSlug");
  const safeSlug = typeof eventSlug === "string" ? eventSlug.trim() : "";
  if (!/^[a-z0-9-]+$/.test(safeSlug)) {
    return redirectToActiveLocale(`/events?error=${encodeURIComponent("invalid-registration")}`);
  }

  const eventId = safeEntityIdSchema.safeParse(formData.get("eventId"));
  if (!eventId.success) {
    return redirectToActiveLocale(registrationErrorPath(safeSlug, "invalid-registration"));
  }
  if (!checkRateLimit(`registration:${captainId}:${eventId.data}`, 5, 15 * 60 * 1000)) {
    return redirectToActiveLocale(registrationErrorPath(safeSlug, "rate-limited"));
  }

  const parsed = registrationSchema.safeParse({
    eventId: formData.get("eventId"),
    eventSlug: safeSlug,
    draftTeamId: formData.get("draftTeamId") || undefined,
    name: formData.get("name"),
    tag: formData.get("tag"),
    captainIgn: formData.get("captainIgn"),
    captainUid: formData.get("captainUid"),
    captainContact: formData.get("captainContact"),
  });

  if (!parsed.success) {
    return redirectToActiveLocale(registrationErrorPath(safeSlug, "invalid-registration"));
  }

  const registrationText = [
    parsed.data.name,
    parsed.data.tag,
    parsed.data.captainIgn,
    parsed.data.captainUid,
    parsed.data.captainContact,
    ...getStringValues(formData, "playerIgn"),
    ...getStringValues(formData, "playerUid"),
    ...getStringValues(formData, "playerPosition"),
  ];
  if (registrationText.some((value) => /[<>]/.test(value))) {
    return redirectToActiveLocale(registrationErrorPath(safeSlug, "invalid-registration"));
  }

  const event = await getEventBySlug(safeSlug);
  if (!event || event.id !== parsed.data.eventId) {
    return redirectToActiveLocale(registrationErrorPath(safeSlug, "invalid-registration"));
  }

  const access = authorizeWorkspaceResource(
    { id: captainId, role: "captain" } satisfies WorkspaceActor,
    { eventId: parsed.data.eventId, ownerUserId: captainId },
    null,
  );
  if (!access.ok) return redirectToActiveLocale(registrationErrorPath(safeSlug, "invalid-registration"));

  const playerIgn = getStringValues(formData, "playerIgn");
  const playerUid = getStringValues(formData, "playerUid");
  const playerPosition = getStringValues(formData, "playerPosition");

  if (
    playerIgn.length !== playerUid.length ||
    playerIgn.length !== playerPosition.length
  ) {
    return redirectToActiveLocale(registrationErrorPath(safeSlug, "invalid-players"));
  }

  const players = playerIgn.map((ign, index) => ({
    ign,
    uid: playerUid[index] ?? "",
    position: playerPosition[index] || undefined,
  }));

  const captainIsPlayer = ["on", "true", "1"].includes(
    String(formData.get("captainIsPlayer") ?? "").toLowerCase(),
  );

  const draftOnly = formData.get("intent") === "draft";
  try {
    const draftTeamId = await saveCaptainRegistrationDraft({
      captainId,
      eventId: parsed.data.eventId,
      draftTeamId: parsed.data.draftTeamId,
      teamName: parsed.data.name,
      teamTag: parsed.data.tag,
      captainIgn: parsed.data.captainIgn,
      captainUid: parsed.data.captainUid,
      captainContact: parsed.data.captainContact,
      captainIsPlayer,
      players,
    });

    if (!draftOnly) {
    const registration = {
      eventId: parsed.data.eventId,
      captainId,
      name: parsed.data.name,
      tag: parsed.data.tag,
      draftTeamId,
    };

    try {
      await registerTeam(registration);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== paidEventError) {
        throw error;
      }

      await createTeamRegistrationRequest(registration);
    }
    }
  } catch (error) {
    const message = toSafeActionMessage(error, "Pendaftaran gagal disimpan.");
    return redirectToActiveLocale(registrationErrorPath(safeSlug, message));
  }

  revalidateTag("teams");
  revalidatePath(`/events/${safeSlug}`);
  revalidatePath(`/events/${safeSlug}/register`);
  const successPath = draftOnly ? "success=draft-saved" : "success=registration-submitted";
  redirectToActiveLocale(
    `/events/${safeSlug}/register?${successPath}`,
  );
}

export async function captainRegisterEventTeamAction(formData: FormData) {
  return withServerActionLog("captain_registration", "/server-actions/registration/captain", () => captainRegisterEventTeamActionImpl(formData));
}
