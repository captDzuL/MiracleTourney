import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  assertUserCanManageEvent: vi.fn(),
  getRegistrationImportEventContext: vi.fn(),
  getRegistrationImportBatchForAdmin: vi.fn(),
  getTeamRegistrationRequestForEvent: vi.fn(),
  getEventPaymentSettingsForManager: vi.fn(),
  saveRegistrationImportPreviewBatch: vi.fn(),
  commitRegistrationImportBatch: vi.fn(),
  approveTeamRegistrationRequest: vi.fn(),
  rejectTeamRegistrationRequest: vi.fn(),
  saveEventPaymentSettingsDraft: vi.fn(),
  publishEventPaymentSettings: vi.fn(),
  parseRegistrationSource: vi.fn(),
  suggestRegistrationMapping: vi.fn(),
  buildRegistrationPreview: vi.fn(),
  isEventBracketLocked: vi.fn(),
  getGameModeConfig: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  uploadImageAsset: vi.fn(),
  deleteBlob: vi.fn(),
  checkRateLimit: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ del: mocks.deleteBlob }));
vi.mock("@/lib/actions", () => ({ uploadImageAsset: mocks.uploadImageAsset }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole: mocks.requireAnyRole }));
vi.mock("@/lib/platform/repository", () => ({
  assertUserCanManageEvent: mocks.assertUserCanManageEvent,
  getRegistrationImportEventContext: mocks.getRegistrationImportEventContext,
  getRegistrationImportBatchForAdmin: mocks.getRegistrationImportBatchForAdmin,
  getTeamRegistrationRequestForEvent: mocks.getTeamRegistrationRequestForEvent,
  getEventPaymentSettingsForManager: mocks.getEventPaymentSettingsForManager,
  saveRegistrationImportPreviewBatch: mocks.saveRegistrationImportPreviewBatch,
  commitRegistrationImportBatch: mocks.commitRegistrationImportBatch,
  approveTeamRegistrationRequest: mocks.approveTeamRegistrationRequest,
  rejectTeamRegistrationRequest: mocks.rejectTeamRegistrationRequest,
  isEventBracketLocked: mocks.isEventBracketLocked,
}));
vi.mock("@/lib/registration/event-payment-settings", () => ({
  saveEventPaymentSettingsDraft: mocks.saveEventPaymentSettingsDraft,
  publishEventPaymentSettings: mocks.publishEventPaymentSettings,
}));
vi.mock("@/lib/imports/registration-intake", () => ({
  parseRegistrationSource: mocks.parseRegistrationSource,
  suggestRegistrationMapping: mocks.suggestRegistrationMapping,
  buildRegistrationPreview: mocks.buildRegistrationPreview,
}));
vi.mock("@/lib/platform/config", () => ({ getGameModeConfig: mocks.getGameModeConfig }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: mocks.revalidateTag }));

import {
  approveEventPaymentAction,
  commitEventRegistrationImportAction,
  previewEventRegistrationImportAction,
  publishEventQrisAction,
  rejectEventPaymentAction,
  saveEventQrisDraftAction,
} from "./registration-v3-actions";

const organizer = {
  id: "organizer-1",
  role: "organizer" as const,
  email: "organizer@example.com",
  name: "Organizer",
};

function form(fields: Record<string, string | File>) {
  const value = new FormData();
  for (const [key, item] of Object.entries(fields)) value.set(key, item);
  return value;
}

describe("registration V3 actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAnyRole.mockResolvedValue(organizer);
    mocks.assertUserCanManageEvent.mockResolvedValue(undefined);
    mocks.getRegistrationImportEventContext.mockResolvedValue({
      id: "event-1", slug: "miracle-open", name: "Miracle Open", gameModeId: "mode-1", participantCap: 16,
      format: "Single Elimination", teams: [],
    });
    mocks.getRegistrationImportBatchForAdmin.mockResolvedValue({ id: "batch-1", eventId: "event-1" });
    mocks.getTeamRegistrationRequestForEvent.mockResolvedValue({
      id: "request-1", eventId: "event-1", status: "pending_review", updatedAt: new Date("2026-09-14T10:00:00.000Z"),
    });
    mocks.getEventPaymentSettingsForManager.mockResolvedValue({
      id: "event-payment-1", eventId: "event-1", source: "event", status: "draft", version: 2,
    });
    mocks.parseRegistrationSource.mockResolvedValue({
      sourceKind: "csv",
      worksheets: [{ name: "registrations.csv", rows: [
        [{ value: "Team Name", formula: false }],
        [{ value: "Alpha", formula: false }],
      ] }],
    });
    mocks.suggestRegistrationMapping.mockReturnValue({ columns: { teamName: 0, captainIgn: 0, captainUid: 0 }, players: [] });
    mocks.buildRegistrationPreview.mockReturnValue({ items: [], summary: { new: 0, changed: 0, same: 0, error: 0 } });
    mocks.getGameModeConfig.mockReturnValue({ maxRosterSize: 5, teamSize: 1 });
    mocks.isEventBracketLocked.mockResolvedValue(false);
    mocks.saveRegistrationImportPreviewBatch.mockResolvedValue({ id: "batch-1" });
    mocks.commitRegistrationImportBatch.mockResolvedValue({ importedCount: 2, credentials: [] });
    mocks.approveTeamRegistrationRequest.mockResolvedValue({ id: "team-1" });
    mocks.rejectTeamRegistrationRequest.mockResolvedValue({ id: "request-1", status: "rejected" });
    mocks.saveEventPaymentSettingsDraft.mockResolvedValue({ status: "saved", settings: { eventId: "event-1", version: 3, status: "draft" } });
    mocks.publishEventPaymentSettings.mockResolvedValue({ status: "published", settings: { eventId: "event-1", version: 4, status: "published" } });
    mocks.checkRateLimit.mockReturnValue(true);
  });

  it("returns typed invalid input before opening a session", async () => {
    await expect(previewEventRegistrationImportAction(form({ eventId: "", locale: "en" })))
      .resolves.toMatchObject({ status: "blocked", code: "invalid_input" });
    expect(mocks.requireAnyRole).not.toHaveBeenCalled();
  });

  it.each(["{", JSON.stringify({ columns: { secret: 0 }, players: [] }), JSON.stringify({ columns: { teamName: 9 }, players: [] }), JSON.stringify({ columns: { teamName: 0, captainIgn: 0 }, players: [] })])("rejects malformed, unknown, out-of-range or duplicate mapping: %s", async mapping => {
    await expect(previewEventRegistrationImportAction(form({ locale: "en", eventId: "event-1", mapping, registrationFile: new File(["x"], "a.csv") }))).resolves.toMatchObject({ status: "blocked", code: "invalid_input" });
    expect(mocks.saveRegistrationImportPreviewBatch).not.toHaveBeenCalled();
  });
  it("returns mapping choices for unrecognized headers without creating a commit batch", async () => {
    mocks.suggestRegistrationMapping.mockReturnValue({ columns: {}, players: [] });
    await expect(previewEventRegistrationImportAction(form({ locale: "en", eventId: "event-1", registrationFile: new File(["x"], "a.csv") }))).resolves.toMatchObject({ status: "mapping_required", headers: ["Team Name"], mapping: { columns: {} } });
    expect(mocks.saveRegistrationImportPreviewBatch).not.toHaveBeenCalled();
  });
  it("enforces 500 UI data rows without changing legacy parser policy", async () => {
    mocks.parseRegistrationSource.mockResolvedValue({ sourceKind: "csv", worksheets: [{ name: "a", rows: Array.from({ length: 502 }, () => [{ value: "x", formula: false }]) }] });
    await expect(previewEventRegistrationImportAction(form({ locale: "en", eventId: "event-1", registrationFile: new File(["x"], "a.csv") }))).resolves.toMatchObject({ status: "blocked", code: "invalid_input" });
    expect(mocks.saveRegistrationImportPreviewBatch).not.toHaveBeenCalled();
  });
  it("returns only safe persisted preview metadata and honors explicit mapping", async () => {
    mocks.parseRegistrationSource.mockResolvedValue({ sourceKind: "csv", worksheets: [{ name: "a", rows: [["Club", "IGN", "UID"].map(value => ({ value, formula: false })), ["Alpha", "Cap", "123"].map(value => ({ value, formula: false }))] }] });
    const mapping = { columns: { teamName: 0, captainIgn: 1, captainUid: 2 }, players: [] };
    mocks.saveRegistrationImportPreviewBatch.mockResolvedValue({ id: "batch-1", expiresAt: new Date("2026-09-20"), items: [{ id: "row-1", sourceRow: 2, status: "new", selected: true, normalizedData: { teamName: "Alpha", captainEmail: "private@example.test", password: "SECRET" }, validationErrors: [] }] });
    const result = await previewEventRegistrationImportAction(form({ locale: "en", eventId: "event-1", mapping: JSON.stringify(mapping), registrationFile: new File(["x"], "a.csv") }));
    expect(result).toMatchObject({ status: "preview_ready", headers: ["Club", "IGN", "UID"], mapping, items: [{ id: "row-1", teamName: "Alpha", sourceRow: 2, status: "new" }] });
    expect(JSON.stringify(result)).not.toMatch(/private@example|SECRET/);
    expect(mocks.buildRegistrationPreview).toHaveBeenCalledWith(expect.objectContaining({ mapping }));
  });
  it("returns localized issue codes without echoing private row content", async () => {
    mocks.saveRegistrationImportPreviewBatch.mockResolvedValue({ id: "batch-1", items: [{ id: "bad", sourceRow: 2, status: "error", selected: false, normalizedData: { teamName: "Alpha" }, validationErrors: ["UID PRIVATE-UID duplikat dalam roster.", "Nama tim wajib diisi.", "Kolom yang dipetakan tidak boleh berisi formula spreadsheet."] }] });
    const result = await previewEventRegistrationImportAction(form({ locale: "en", eventId: "event-1", registrationFile: new File(["x"], "a.csv") }));
    expect(result).toMatchObject({ items: [{ issueCodes: ["duplicate_uid", "team_name", "formula"] }] });
    expect(JSON.stringify(result)).not.toContain("PRIVATE-UID");
  });
  it("rejects stale QRIS uploads before storing any file", async () => {
    await expect(saveEventQrisDraftAction(form({ locale: "en", eventId: "event-1", expectedVersion: "1", qrisImage: new File(["png"], "q.png", { type: "image/png" }) }))).resolves.toMatchObject({ status: "conflict" });
    expect(mocks.uploadImageAsset).not.toHaveBeenCalled(); expect(mocks.saveEventPaymentSettingsDraft).not.toHaveBeenCalled();
  });
  it("cleans up only its newly created QRIS object if CAS loses a concurrent save", async () => {
    mocks.uploadImageAsset.mockResolvedValue({ url: "https://store.public.blob.vercel-storage.com/event-payment-qris/event-1-new.png", storageProvider: "vercel_blob", storageKey: "event-payment-qris/event-1-new.png" });
    mocks.saveEventPaymentSettingsDraft.mockResolvedValue({ status: "conflict", version: 4 });
    await expect(saveEventQrisDraftAction(form({ locale: "en", eventId: "event-1", expectedVersion: "2", qrisImage: new File(["png"], "q.png", { type: "image/png" }) }))).resolves.toMatchObject({ status: "conflict" });
    expect(mocks.deleteBlob).toHaveBeenCalledWith("https://store.public.blob.vercel-storage.com/event-payment-qris/event-1-new.png");
  });
  it("does not upload QRIS for a non-owner", async () => {
    mocks.assertUserCanManageEvent.mockRejectedValue(Error("Not authorized"));
    await expect(saveEventQrisDraftAction(form({ locale: "en", eventId: "event-1", expectedVersion: "2", qrisImage: new File(["png"], "q.png", { type: "image/png" }) }))).resolves.toMatchObject({ status: "blocked", code: "forbidden" });
    expect(mocks.uploadImageAsset).not.toHaveBeenCalled();
  });
  it("stores an authorized QRIS upload under the event identity", async () => {
    mocks.uploadImageAsset.mockResolvedValue({ url: "/event-payment-qris/event-1-unique.png" });
    const result = await saveEventQrisDraftAction(form({ locale: "en", eventId: "event-1", expectedVersion: "2", qrisImage: new File(["png"], "q.png", { type: "image/png" }), qrisImageUrl: "https://evil.test/a.png" }));
    expect(result.status).toBe("saved");
    expect(mocks.uploadImageAsset).toHaveBeenCalledWith(expect.objectContaining({ folder: "event-payment-qris", entityId: "event-1", maxBytes: 5242880, validationMode: "throw" }));
    expect(mocks.saveEventPaymentSettingsDraft).toHaveBeenCalledWith(expect.objectContaining({ qrisImageUrl: "/event-payment-qris/event-1-unique.png" }));
  });
  it("does not save QRIS content rejected by the validated upload helper", async () => {
    mocks.uploadImageAsset.mockRejectedValue(Error("signature mismatch"));
    await expect(saveEventQrisDraftAction(form({ locale: "en", eventId: "event-1", expectedVersion: "2", qrisImage: new File(["fake"], "q.png", { type: "image/png" }) }))).resolves.toMatchObject({ status: "blocked" });
    expect(mocks.saveEventPaymentSettingsDraft).not.toHaveBeenCalled();
  });

  it("previews an import for one event and returns a localized canonical registration URL", async () => {
    const result = await previewEventRegistrationImportAction(form({
      locale: "en",
      eventId: "event-1",
      returnTo: "/en/organizer/events/event-1/registration?view=import",
      registrationFile: new File(["Team Name\nAlpha"], "registrations.csv", { type: "text/csv" }),
    }));

    expect(result).toMatchObject({
      status: "preview_ready",
      batchId: "batch-1",
      redirectTo: "/en/organizer/events/event-1/registration?view=import",
    });
    expect(mocks.assertUserCanManageEvent).toHaveBeenCalledWith(organizer, "event-1");
    expect(mocks.saveRegistrationImportPreviewBatch).toHaveBeenCalledWith(expect.objectContaining({ user: organizer, eventId: "event-1" }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/organizer/events/event-1/registration");
    expect(result.redirectTo).not.toContain("/admin");
  });

  it("commits only a batch belonging to the submitted event and refreshes event-local paths", async () => {
    await expect(commitEventRegistrationImportAction(form({
      locale: "id", eventId: "event-1", batchId: "batch-1", itemId: "item-1",
      returnTo: "/id/organizer/events/event-1/registration?view=import",
    }))).resolves.toMatchObject({ status: "imported", importedCount: 2 });
    expect(mocks.getRegistrationImportBatchForAdmin).toHaveBeenCalledWith(organizer, "batch-1");
    expect(mocks.commitRegistrationImportBatch).toHaveBeenCalledWith(organizer, "batch-1", ["item-1"]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/id/organizer/events/event-1/registration");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/admin");
  });

  it("blocks a rate-limited import before parsing or creating a preview batch", async () => {
    mocks.checkRateLimit.mockReturnValue(false);
    await expect(previewEventRegistrationImportAction(form({ locale: "en", eventId: "event-1", registrationFile: new File(["x"], "a.csv") })))
      .resolves.toMatchObject({ status: "blocked", code: "rate_limited" });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("registration-import:organizer-1:event-1", 5, 900000);
    expect(mocks.parseRegistrationSource).not.toHaveBeenCalled();
    expect(mocks.saveRegistrationImportPreviewBatch).not.toHaveBeenCalled();
  });

  it("blocks a rate-limited QRIS upload before storage or settings writes", async () => {
    mocks.checkRateLimit.mockReturnValue(false);
    await expect(saveEventQrisDraftAction(form({ locale: "en", eventId: "event-1", expectedVersion: "2", qrisImage: new File(["png"], "q.png", { type: "image/png" }) })))
      .resolves.toMatchObject({ status: "blocked", code: "rate_limited" });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("registration-qris:organizer-1:event-1", 5, 900000);
    expect(mocks.uploadImageAsset).not.toHaveBeenCalled();
    expect(mocks.saveEventPaymentSettingsDraft).not.toHaveBeenCalled();
  });

  it("denies a manipulated import batch from another event without exposing batch metadata or committing", async () => {
    mocks.getRegistrationImportBatchForAdmin.mockResolvedValue({ id: "batch-b", eventId: "event-other" });

    const result = await commitEventRegistrationImportAction(form({
      locale: "en", eventId: "event-1", batchId: "batch-b", itemId: "item-b",
      returnTo: "/en/organizer/events/event-1/registration?view=import",
    }));
    expect(result).toMatchObject({ status: "blocked", code: "forbidden" });
    expect(JSON.stringify(result)).not.toContain("event-other");
    expect(mocks.commitRegistrationImportBatch).not.toHaveBeenCalled();
  });

  it("returns a clean conflict when payment approval loses its pending/version precondition", async () => {
    mocks.approveTeamRegistrationRequest.mockRejectedValue(new Error("Stale payment review"));

    await expect(approveEventPaymentAction(form({
      locale: "en", eventId: "event-1", requestId: "request-1", version: "2026-09-14T10:00:00.000Z",
      returnTo: "/en/organizer/events/event-1/registration?view=payments",
    }))).resolves.toMatchObject({ status: "conflict", code: "stale_mutation" });
    expect(mocks.getTeamRegistrationRequestForEvent).toHaveBeenCalledWith(organizer, "event-1", "request-1");
    expect(mocks.approveTeamRegistrationRequest).toHaveBeenCalledWith(
      organizer,
      "request-1",
      expect.objectContaining({ expectedUpdatedAt: new Date("2026-09-14T10:00:00.000Z") }),
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns the approved payment receipt and invalidates tags without revalidating the active route", async () => {
    await expect(approveEventPaymentAction(form({
      locale: "en", eventId: "event-1", requestId: "request-1", version: "2026-09-14T10:00:00.000Z",
      returnTo: "/en/organizer/events/event-1/registration?view=payments",
    }))).resolves.toMatchObject({
      status: "approved", team: { id: "team-1" },
      redirectTo: "/en/organizer/events/event-1/registration?view=payments",
    });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("teams");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("events");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects payment only after checking event identity and returns localized feedback", async () => {
    await expect(rejectEventPaymentAction(form({
      locale: "id", eventId: "event-1", requestId: "request-1", reason: "Bukti tidak sesuai", version: "2026-09-14T10:00:00.000Z",
      returnTo: "/id/organizer/events/event-1/registration?view=payments",
    }))).resolves.toMatchObject({ status: "rejected", redirectTo: "/id/organizer/events/event-1/registration?view=payments" });
    expect(mocks.rejectTeamRegistrationRequest).toHaveBeenCalledWith(
      organizer,
      "request-1",
      "Bukti tidak sesuai",
      expect.objectContaining({ expectedUpdatedAt: new Date("2026-09-14T10:00:00.000Z") }),
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith("teams");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("events");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("saves and publishes event QRIS through EventPaymentSettings CAS writes", async () => {
    await expect(saveEventQrisDraftAction(form({
      locale: "en", eventId: "event-1", expectedVersion: "2", qrisImageUrl: "/payment-qris/event-1.png",
      instructions: "Scan QRIS ini", returnTo: "/en/organizer/events/event-1/registration?view=qris",
    }))).resolves.toMatchObject({ status: "saved", version: 3, redirectTo: "/en/organizer/events/event-1/registration?view=qris" });
    expect(mocks.saveEventPaymentSettingsDraft).toHaveBeenCalledWith(expect.objectContaining({
      eventId: "event-1", actor: organizer, expectedVersion: 2,
    }));

    await expect(publishEventQrisAction(form({
      locale: "en", eventId: "event-1", expectedVersion: "3", returnTo: "/en/organizer/events/event-1/registration?view=qris",
    }))).resolves.toMatchObject({ status: "published", version: 4 });
    expect(mocks.publishEventPaymentSettings).toHaveBeenCalledWith({ eventId: "event-1", actor: organizer, expectedVersion: 3 });
  });

  it("returns authoritative QRIS success results and navigation targets without eager path revalidation", async () => {
    await expect(saveEventQrisDraftAction(form({
      locale: "id", eventId: "event-1", expectedVersion: "2", qrisImageUrl: "/payment-qris/event-1.png",
      instructions: "Pindai QRIS", returnTo: "/id/organizer/events/event-1/registration?view=qris",
    }))).resolves.toMatchObject({
      status: "saved", version: 3, settings: { version: 3, status: "draft" },
      redirectTo: "/id/organizer/events/event-1/registration?view=qris",
    });
    await expect(publishEventQrisAction(form({
      locale: "id", eventId: "event-1", expectedVersion: "3", returnTo: "/id/organizer/events/event-1/registration?view=qris",
    }))).resolves.toMatchObject({
      status: "published", version: 4, settings: { version: 4, status: "published" },
      redirectTo: "/id/organizer/events/event-1/registration?view=qris",
    });

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("denies a non-owner without touching payment or import repositories", async () => {
    mocks.assertUserCanManageEvent.mockRejectedValue(new Error("Not authorized"));

    await expect(saveEventQrisDraftAction(form({ locale: "id", eventId: "event-other", expectedVersion: "0" })))
      .resolves.toMatchObject({ status: "blocked", code: "forbidden" });
    expect(mocks.saveEventPaymentSettingsDraft).not.toHaveBeenCalled();
    expect(mocks.commitRegistrationImportBatch).not.toHaveBeenCalled();
  });

  it("falls back to a localized event registration URL for an unsafe return target", async () => {
    await expect(publishEventQrisAction(form({
      locale: "en", eventId: "event-1", expectedVersion: "3", returnTo: "https://evil.example/admin",
    }))).resolves.toMatchObject({
      status: "published",
      redirectTo: "/en/organizer/events/event-1/registration?view=qris",
    });
  });
});
