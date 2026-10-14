"use server";

// Server actions for team CSV and registration import.
// Moved out of lib/actions.ts without changes (refactor PR 3.5).

import { redirectToActiveLocale } from "@/i18n/redirect";
import { commitRegistrationImportForUser, previewRegistrationImportForUser } from "@/lib/actions/registration-v3-actions";
import { actionEntityId } from "@/lib/actions/shared/request";
import { assertWorkspaceEventAction, requireAdminSession } from "@/lib/actions/shared/session";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import { revalidatePath, revalidateTag } from "next/cache";

export async function adminPreviewRegistrationImportAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  await assertUserCanManageEvent(user, eventId);
  assertWorkspaceEventAction(user, eventId);
  const file = formData.get("registrationFile");
  if (!(file instanceof File) || file.size === 0) {
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&error=${encodeURIComponent("Pilih file XLSX atau CSV terlebih dahulu.")}` as never,
    );
  }
  if (file.size > 5 * 1024 * 1024) {
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&error=${encodeURIComponent("File registrasi maksimal 5 MiB.")}` as never,
    );
  }
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".csv")) {
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&error=${encodeURIComponent("File harus berformat .xlsx atau .csv.")}` as never,
    );
  }
  const result = await previewRegistrationImportForUser(user, formData, { legacyCompatibility: true });
  if (result.status === "preview_ready") {
    revalidatePath("/", "layout");
    return redirectToActiveLocale(
      `/admin?phase=registration&activeEventId=${eventId}&registrationBatchId=${result.batchId}&success=registration-preview-ready` as never,
    );
  }
  if (result.status === "blocked" && result.legacy?.behavior === "throw") throw new Error(result.legacy.message);
  const phase = result.status === "blocked" && result.legacy?.phase === "registration" ? "registration" : "import";
  const message = result.status === "blocked" && result.legacy?.message
    ? result.legacy.message
    : result.status === "blocked" || result.status === "conflict"
      ? result.message
      : "Preview import registrasi gagal.";
  const activeEventId = result.status === "blocked" && result.legacy?.includeActiveEventId === false
    ? ""
    : `&activeEventId=${eventId}`;
  return redirectToActiveLocale(
    `/admin?phase=${phase}${activeEventId}&error=${encodeURIComponent(message)}` as never,
  );
}

export async function adminCommitRegistrationImportAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  const batchId = actionEntityId.parse(formData.get("batchId"));
  const selectedItemIds = formData.getAll("itemId").map(String).filter(Boolean);
  if (selectedItemIds.length === 0) {
    return redirectToActiveLocale(
      `/admin?phase=registration&activeEventId=${eventId}&registrationBatchId=${batchId}&error=${encodeURIComponent("Pilih minimal satu baris Baru atau Berubah untuk diimport.")}` as never,
    );
  }
  const result = await commitRegistrationImportForUser(user, formData, { legacyCompatibility: true });
  if (result.status === "imported") {
    revalidateTag("teams");
    revalidatePath("/", "layout");
    return redirectToActiveLocale(
      `/admin?phase=registration&activeEventId=${eventId}&success=registration-imported&count=${result.importedCount}` as never,
    );
  }
  if (result.status === "blocked" && result.legacy?.behavior === "throw") throw new Error(result.legacy.message);
  const message = result.status === "blocked" && result.legacy?.message
    ? result.legacy.message
    : result.status === "blocked" || result.status === "conflict"
      ? result.message
      : "Import registrasi gagal.";
  return redirectToActiveLocale(
    `/admin?phase=registration&activeEventId=${eventId}&registrationBatchId=${batchId}&error=${encodeURIComponent(message)}` as never,
  );
}
