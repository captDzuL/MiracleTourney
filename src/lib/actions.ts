"use server";
import { revalidatePath } from "next/cache";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { prisma } from "@/lib/platform/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { toSafeActionMessage } from "@/lib/security/public-error";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import { assertWorkspaceEventAction, requireAdminSession } from "@/lib/actions/shared/session";
import { actionEntityId } from "@/lib/actions/shared/request";



/**
 * Re-renders the champion certificate for an event, replacing whatever is stored.
 *
 * Used to recover from a failed generation (headless Chromium is the usual culprit) and to pick up
 * a new accent color or character art. Rate limited because each run boots a browser.
 */
export async function adminRegenerateCertificateAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  await assertUserCanManageEvent(user, eventId);
  assertWorkspaceEventAction(user, eventId);

  if (!(await checkRateLimit(`cert-regen:${eventId}`, 3, 5 * 60 * 1000))) {
    await redirectToActiveLocale(
      `/admin?error=${encodeURIComponent("Terlalu banyak percobaan. Coba lagi dalam beberapa menit.")}`,
    );
  }

  const finalMatch = await prisma.match.findFirst({
    where: { eventId, roundLabel: "Final", winnerTeamId: { not: null } },
  });
  const winnerTeamId = finalMatch?.winnerTeamId;
  if (!winnerTeamId) {
    await redirectToActiveLocale(
      `/admin?error=${encodeURIComponent("Belum ada juara. Simpan hasil match Final terlebih dahulu.")}`,
    );
    return;
  }

  try {
    const { generateCertificate } = await import("@/lib/certificate/generate");
    await generateCertificate(eventId, winnerTeamId);
  } catch (err) {
    const message = toSafeActionMessage(err, "Certificate generation failed");
    revalidatePath("/admin");
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin");
  await redirectToActiveLocale(`/admin?success=certificate-regenerated`);
}

