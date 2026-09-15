import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertUserCanManageEvent: vi.fn(),
  getRegistrationRecordsForEvent: vi.fn(),
  getRegistrationImportHistoryForEvent: vi.fn(),
  getPaymentReviewForEvent: vi.fn(),
  getEventPaymentSettingsForManager: vi.fn(),
}));

vi.mock("@/lib/platform/repository", () => mocks);

import {
  getEventImportHistory,
  getEventPaymentReview,
  getEventQris,
  getEventRegistrationQueue,
} from "./organizer-workspace-read";

const organizer = {
  id: "organizer-1",
  role: "organizer" as const,
  email: "organizer@example.com",
  name: "Organizer",
};

const records = [
  {
    id: "team-alpha",
    eventId: "event-1",
    teamId: "team-alpha",
    teamName: "Alpha",
    teamTag: "ALP",
    captainName: "Alya",
    captainIsPlayer: true,
    rosterCount: 5,
    source: "captain_registration" as const,
    status: "accepted" as const,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    origin: "Team",
  },
  {
    id: "team-beta",
    eventId: "event-1",
    teamId: "team-beta",
    teamName: "Beta",
    teamTag: "BET",
    captainName: "Bima",
    captainIsPlayer: true,
    rosterCount: 5,
    source: "import_csv" as const,
    status: "accepted" as const,
    createdAt: new Date("2026-09-02T00:00:00.000Z"),
    origin: "Team",
  },
  {
    id: "request-gamma",
    eventId: "event-1",
    teamName: "Gamma",
    teamTag: "GAM",
    captainName: "Gita",
    captainIsPlayer: true,
    rosterCount: 0,
    source: "captain_registration" as const,
    status: "pending_review" as const,
    createdAt: new Date("2026-09-03T00:00:00.000Z"),
    origin: "TeamRegistrationRequest",
  },
];

describe("organizer registration workspace readers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertUserCanManageEvent.mockResolvedValue(undefined);
    mocks.getRegistrationRecordsForEvent.mockResolvedValue(records);
    mocks.getRegistrationImportHistoryForEvent.mockResolvedValue([
      { id: "batch-1", eventId: "event-1", sourceKind: "csv", status: "draft", itemCount: 3 },
    ]);
    mocks.getPaymentReviewForEvent.mockResolvedValue([
      { id: "request-gamma", eventId: "event-1", status: "pending_review", proofImageUrl: "/proofs/gamma.png" },
    ]);
    mocks.getEventPaymentSettingsForManager.mockResolvedValue({
      id: "event-payment-1",
      eventId: "event-1",
      source: "event",
      status: "draft",
      version: 4,
      qrisImageUrl: "/payment-qris/event-1.png",
    });
  });

  it("filters the event-local queue by source/search and paginates the result", async () => {
    await expect(getEventRegistrationQueue({
      user: organizer,
      eventId: "event-1",
      source: "import_csv",
      query: " beta ",
      page: 1,
      pageSize: 1,
    })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "team-beta", teamName: "Beta" })],
      total: 1,
      page: 1,
      pageSize: 1,
      totalPages: 1,
    });
    expect(mocks.assertUserCanManageEvent).toHaveBeenCalledWith(organizer, "event-1");
    expect(mocks.getRegistrationRecordsForEvent).toHaveBeenCalledWith(organizer, "event-1");
  });

  it("rejects a non-owner before reading any event registration data", async () => {
    mocks.assertUserCanManageEvent.mockRejectedValue(new Error("Not authorized"));

    await expect(getEventRegistrationQueue({ user: organizer, eventId: "event-other" }))
      .rejects.toThrow("Not authorized");
    expect(mocks.getRegistrationRecordsForEvent).not.toHaveBeenCalled();
    expect(mocks.getRegistrationImportHistoryForEvent).not.toHaveBeenCalled();
  });

  it("reads import history and payment proofs only for the authorized event", async () => {
    await expect(getEventImportHistory({ user: organizer, eventId: "event-1" })).resolves.toEqual([
      expect.objectContaining({ id: "batch-1", eventId: "event-1" }),
    ]);
    await expect(getEventPaymentReview({ user: organizer, eventId: "event-1", status: "pending_review" }))
      .resolves.toEqual([expect.objectContaining({ id: "request-gamma", eventId: "event-1" })]);

    expect(mocks.getRegistrationImportHistoryForEvent).toHaveBeenCalledWith(organizer, "event-1");
    expect(mocks.getPaymentReviewForEvent).toHaveBeenCalledWith(organizer, "event-1", "pending_review");
    expect(mocks.assertUserCanManageEvent).toHaveBeenCalledTimes(2);
  });

  it("exposes event QRIS draft state without falling back to a global writable setting", async () => {
    await expect(getEventQris({ user: organizer, eventId: "event-1" })).resolves.toMatchObject({
      source: "event",
      eventId: "event-1",
      status: "draft",
      version: 4,
      qrisImageUrl: "/payment-qris/event-1.png",
    });
    expect(mocks.getEventPaymentSettingsForManager).toHaveBeenCalledWith(organizer, "event-1");
  });
});
