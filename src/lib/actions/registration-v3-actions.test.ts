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
}));

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
  });

  it("returns typed invalid input before opening a session", async () => {
    await expect(previewEventRegistrationImportAction(form({ eventId: "", locale: "en" })))
      .resolves.toMatchObject({ status: "blocked", code: "invalid_input" });
    expect(mocks.requireAnyRole).not.toHaveBeenCalled();
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

  it("returns a clean conflict when payment approval loses its pending/version precondition", async () => {
    mocks.approveTeamRegistrationRequest.mockRejectedValue(new Error("Stale payment review"));

    await expect(approveEventPaymentAction(form({
      locale: "en", eventId: "event-1", requestId: "request-1", version: "2026-09-14T10:00:00.000Z",
      returnTo: "/en/organizer/events/event-1/registration?view=payments",
    }))).resolves.toMatchObject({ status: "conflict", code: "stale_mutation" });
    expect(mocks.getTeamRegistrationRequestForEvent).toHaveBeenCalledWith("request-1");
    expect(mocks.approveTeamRegistrationRequest).toHaveBeenCalledWith(
      organizer,
      "request-1",
      expect.objectContaining({ expectedUpdatedAt: new Date("2026-09-14T10:00:00.000Z") }),
    );
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
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/organizer/events/event-1/registration");
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
