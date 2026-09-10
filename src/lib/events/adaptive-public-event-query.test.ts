import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  teamCount: vi.fn(),
  requestCount: vi.fn(),
  requestFindFirst: vi.fn(),
  teamFindFirst: vi.fn(),
  teamFindMany: vi.fn(),
  platformFindUnique: vi.fn(),
}));

vi.mock("@/lib/platform/db", () => ({
  prisma: {
    event: { findFirst: mocks.eventFindFirst },
    team: { count: mocks.teamCount, findFirst: mocks.teamFindFirst, findMany: mocks.teamFindMany },
    teamRegistrationRequest: { count: mocks.requestCount, findFirst: mocks.requestFindFirst },
    platformProfile: { findUnique: mocks.platformFindUnique },
  },
}));

import { getAdaptivePublicEventView, getAdaptivePublicEventViewWithRetry } from "./adaptive-public-event";

const baseEvent = {
  id: "event-1",
  slug: "miracle-cup",
  name: "Miracle Cup",
  description: "Event",
  logoUrl: "/logo.png",
  gameImageUrl: "/legacy-poster.png",
  gameId: "game-mobile-legends",
  gameModeId: "mode-mlbb-5v5",
  format: "Single Elimination",
  formatConfig: null,
  status: "Published",
  participantCap: 16,
  registrationOpensAt: new Date("2026-09-11T00:00:00Z"),
  registrationClosesAt: new Date("2026-09-20T00:00:00Z"),
  eventStartsAt: new Date("2026-09-21T00:00:00Z"),
  startsAt: "2026-09-21",
  timezone: "Asia/Jakarta",
  venue: "Online",
  venueAddress: null,
  prizePoolLabel: "Rp5.000.000",
  registrationFeeRequired: true,
  registrationFeeAmount: 20000,
  registrationFeeLabel: "Rp20.000",
  organizerUserId: "org-1",
  organizerName: "Old Name",
  organizerVerified: false,
  organizer: {
    name: "Owner",
    organizerProfile: {
      organizationName: "Miracle Community",
      contactChannel: "WhatsApp",
      contactValue: "+628123456789",
      verified: true,
    },
  },
  activeVisualAsset: { status: "approved", url: "/approved-poster.png" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventFindFirst.mockResolvedValue(baseEvent);
  mocks.teamCount.mockResolvedValue(10);
  mocks.requestCount.mockResolvedValue(2);
  mocks.teamFindFirst.mockResolvedValue(null);
  mocks.teamFindMany.mockResolvedValue([]);
  mocks.requestFindFirst.mockResolvedValue(null);
  mocks.platformFindUnique.mockResolvedValue(null);
});

describe("getAdaptivePublicEventView", () => {
  it("counts only pending-review requests as occupied and prefers approved poster art", async () => {
    const view = await getAdaptivePublicEventView("miracle-cup", null, new Date("2026-09-12T00:00:00Z"));

    expect(view).toMatchObject({
      event: { posterUrl: "/approved-poster.png", logoUrl: "/logo.png", gameName: "Mobile Legends", modeName: "5v5" },
      organizer: { name: "Miracle Community", verified: true, contactHref: "https://wa.me/628123456789" },
      registration: { activeTeamCount: 10, pendingReviewCount: 2, occupiedSlots: 12, remainingSlots: 4 },
      viewer: { state: "anonymous", cta: { kind: "login" } },
    });
    expect(mocks.requestCount).toHaveBeenCalledWith({
      where: { eventId: "event-1", status: "pending_review" },
    });
  });

  it("uses the global Miracle profile for platform-owned events", async () => {
    mocks.eventFindFirst.mockResolvedValue({ ...baseEvent, organizerUserId: null, organizer: null });
    mocks.platformFindUnique.mockResolvedValue({
      displayName: "Miracle Official",
      contactChannel: "Email",
      contactValue: "hello@miracle.id",
    });

    const view = await getAdaptivePublicEventView("miracle-cup", null, new Date("2026-09-12T00:00:00Z"));
    expect(view?.organizer).toMatchObject({
      name: "Miracle",
      verified: true,
      contactChannel: "Email",
      contactHref: "mailto:hello@miracle.id",
    });
  });

  it("lets an existing payment journey override a generally full page", async () => {
    mocks.teamCount.mockResolvedValue(15);
    mocks.requestCount.mockResolvedValue(1);
    mocks.requestFindFirst.mockResolvedValue({
      status: "pending_payment",
      expiresAt: new Date("2026-09-13T00:00:00Z"),
    });

    const captain = { id: "captain-1", email: "captain@miracle.id", name: "Captain", role: "captain" as const };
    const view = await getAdaptivePublicEventView("miracle-cup", captain, new Date("2026-09-12T00:00:00Z"));
    expect(view?.registration.availability).toBe("full");
    expect(view?.viewer).toMatchObject({ state: "pending_payment", cta: { kind: "continue" } });
  });

  it("marks events without a structured start date as legacy", async () => {
    mocks.eventFindFirst.mockResolvedValue({ ...baseEvent, eventStartsAt: null, startsAt: "Segera" });
    const view = await getAdaptivePublicEventView("miracle-cup", null, new Date("2026-09-12T00:00:00Z"));
    expect(view?.registration.availability).toBe("legacy");
  });

  it("leaves an absent fee label for the localized renderer to describe", async () => {
    mocks.eventFindFirst.mockResolvedValue({
      ...baseEvent,
      registrationFeeRequired: false,
      registrationFeeAmount: null,
      registrationFeeLabel: null,
    });
    const view = await getAdaptivePublicEventView("miracle-cup", null, new Date("2026-09-12T00:00:00Z"));
    expect(view?.registration.feeLabel).toBe("");
  });


  it("retries one transient database failure before falling back", async () => {
    mocks.eventFindFirst
      .mockRejectedValueOnce(new Error("temporary Neon connection failure"))
      .mockResolvedValueOnce(baseEvent);

    const view = await getAdaptivePublicEventViewWithRetry(
      "miracle-cup",
      null,
      new Date("2026-09-12T00:00:00Z"),
    );

    expect(view?.event.id).toBe("event-1");
    expect(mocks.eventFindFirst).toHaveBeenCalledTimes(2);
  });

});