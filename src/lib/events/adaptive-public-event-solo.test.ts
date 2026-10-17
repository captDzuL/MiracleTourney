import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  teamCount: vi.fn(),
  requestCount: vi.fn(),
  requestFindFirst: vi.fn(),
  teamFindFirst: vi.fn(),
  teamFindMany: vi.fn(),
  platformFindUnique: vi.fn(),
  soloFindUnique: vi.fn(),
  getSoloQuotaSnapshot: vi.fn(),
}));

vi.mock("@/lib/platform/db", () => ({
  prisma: {
    event: { findFirst: mocks.eventFindFirst },
    team: { count: mocks.teamCount, findFirst: mocks.teamFindFirst, findMany: mocks.teamFindMany },
    teamRegistrationRequest: { count: mocks.requestCount, findFirst: mocks.requestFindFirst },
    soloRegistration: { findUnique: mocks.soloFindUnique },
    platformProfile: { findUnique: mocks.platformFindUnique },
  },
}));
vi.mock("@/lib/solo/registration-repository", () => ({ getSoloQuotaSnapshot: mocks.getSoloQuotaSnapshot }));

import { buildSoloRegistrationCta, getAdaptivePublicEventView } from "./adaptive-public-event";

const href = "/events/solo-cup/register";

describe("buildSoloRegistrationCta", () => {
  it.each([
    ["anonymous", "open", { kind: "login", label: "register_solo" }],
    ["eligible_without_team", "open", { kind: "start", label: "register_solo", href }],
    ["expired", "open", { kind: "start", label: "register_again", href }],
    ["queued", "open", { kind: "status", label: "view_queue_position", href }],
    ["pending_payment", "open", { kind: "continue", label: "continue_payment", href }],
    ["pending_review", "open", { kind: "status", label: "view_registration_status", href }],
    ["rejected", "open", { kind: "continue", label: "repair_payment_proof", href }],
    ["approved", "open", { kind: "status", label: "view_registration_status", href }],
  ] as const)("%s while registration is %s", (state, availability, expected) => {
    expect(buildSoloRegistrationCta({ state, availability, href })).toMatchObject(expected);
  });

  it("tells a captain or any non-player account to use a player account", () => {
    expect(buildSoloRegistrationCta({ state: "wrong_role", availability: "open", href })).toMatchObject({
      kind: "disabled", label: "use_player_account", reason: "player_account_required", enabled: false,
    });
  });

  it.each([
    ["upcoming", "registration_upcoming"],
    ["closed", "registration_closed"],
    ["legacy", "registration_unavailable"],
  ] as const)("is disabled with a reason while registration is %s", (availability, reason) => {
    expect(buildSoloRegistrationCta({ state: "eligible_without_team", availability, href })).toMatchObject({ kind: "disabled", reason, enabled: false });
    expect(buildSoloRegistrationCta({ state: "anonymous", availability, href })).toMatchObject({ kind: "disabled", reason });
  });

  it("keeps showing a player their own registration after the window closes", () => {
    expect(buildSoloRegistrationCta({ state: "approved", availability: "closed", href })).toMatchObject({ kind: "status" });
    expect(buildSoloRegistrationCta({ state: "queued", availability: "closed", href })).toMatchObject({ kind: "status" });
  });

  it("never reports a full event, because the queue takes everyone else", () => {
    expect(buildSoloRegistrationCta({ state: "eligible_without_team", availability: "full", href })).toMatchObject({ kind: "start", label: "register_solo" });
  });
});

const soloEvent = {
  id: "event-1", slug: "solo-cup", name: "Solo Cup", description: "d", logoUrl: null, gameImageUrl: null,
  gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5", format: "Single Elimination", formatConfig: null,
  status: "Published", participantCap: 8, entryMode: "solo",
  registrationOpensAt: new Date("2026-09-11T00:00:00Z"), registrationClosesAt: new Date("2026-09-20T00:00:00Z"),
  eventStartsAt: new Date("2026-09-21T00:00:00Z"), startsAt: "2026-09-21", timezone: "Asia/Jakarta", venue: "Online", venueAddress: null,
  prizePoolLabel: null, registrationFeeRequired: true, registrationFeeAmount: 20000, registrationFeeLabel: "Rp20.000",
  organizerUserId: "org-1", organizerName: "Org", organizerVerified: true,
  organizer: { name: "Owner", organizerProfile: { organizationName: "Miracle", contactChannel: "WhatsApp", contactValue: "+628123456789", verified: true } },
  activeVisualAsset: null,
};
const snapshot = { required: { quota: 8, held: 8, queued: 3 }, open: { quota: 32, held: 20, queued: 0 } };
const now = new Date("2026-09-12T00:00:00Z");
const player = { id: "player-1", role: "player", email: "p@x.id", name: "P" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "true");
  mocks.eventFindFirst.mockResolvedValue(soloEvent);
  mocks.teamCount.mockResolvedValue(0);
  mocks.requestCount.mockResolvedValue(0);
  mocks.teamFindFirst.mockResolvedValue(null);
  mocks.teamFindMany.mockResolvedValue([]);
  mocks.requestFindFirst.mockResolvedValue(null);
  mocks.platformFindUnique.mockResolvedValue(null);
  mocks.soloFindUnique.mockResolvedValue(null);
  mocks.getSoloQuotaSnapshot.mockResolvedValue(snapshot);
});
afterEach(() => vi.unstubAllEnvs());

describe("getAdaptivePublicEventView for a solo event", () => {
  it("describes the slots and points the registration button at the event's own page", async () => {
    const view = await getAdaptivePublicEventView("solo-cup", null, now);
    expect(view).toMatchObject({
      registration: {
        mode: "solo",
        availability: "open",
        solo: { requiredPosition: "Goalkeeper", slots: snapshot },
      },
      viewer: { state: "anonymous", cta: { kind: "login", label: "register_solo" } },
    });
  });

  it("stays open when every slot is taken, because the queue is open", async () => {
    mocks.getSoloQuotaSnapshot.mockResolvedValue({ required: { quota: 8, held: 8, queued: 5 }, open: { quota: 32, held: 32, queued: 9 } });
    const view = await getAdaptivePublicEventView("solo-cup", player, now);
    expect(view).toMatchObject({ registration: { availability: "open" }, viewer: { cta: { kind: "start", label: "register_solo", href: "/events/solo-cup/register" } } });
  });

  it("does not count teams, which a solo event only has after the draw", async () => {
    mocks.teamCount.mockResolvedValue(7);
    mocks.requestCount.mockResolvedValue(3);
    const view = await getAdaptivePublicEventView("solo-cup", null, now);
    expect(view).toMatchObject({ registration: { activeTeamCount: 0, pendingReviewCount: 0, occupiedSlots: 0 } });
    expect(mocks.teamCount).not.toHaveBeenCalled();
    expect(mocks.requestCount).not.toHaveBeenCalled();
  });

  it.each([
    ["queued", {}, "queued"],
    ["approved", {}, "approved"],
    ["pending_review", {}, "pending_review"],
    ["pending_payment", { expiresAt: new Date("2026-09-13T00:00:00Z") }, "pending_payment"],
    ["pending_payment", { expiresAt: new Date("2026-09-11T00:00:00Z") }, "expired"],
    ["rejected", { expiresAt: new Date("2026-09-13T00:00:00Z") }, "rejected"],
    ["rejected", { expiresAt: new Date("2026-09-11T00:00:00Z") }, "expired"],
    ["expired", {}, "eligible_without_team"],
    ["withdrawn", {}, "eligible_without_team"],
  ])("shows a player whose registration is %s (%j) as %s", async (status, extra, expected) => {
    mocks.soloFindUnique.mockResolvedValue({ status, expiresAt: null, ...extra });
    const view = await getAdaptivePublicEventView("solo-cup", player, now);
    expect(view?.mode === "registration" && view.viewer.state).toBe(expected);
  });

  it("looks the registration up by this player and this event only", async () => {
    await getAdaptivePublicEventView("solo-cup", player, now);
    expect(mocks.soloFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId_userId: { eventId: "event-1", userId: "player-1" } } }));
  });

  it("asks a captain to use a player account and does not read their teams", async () => {
    const view = await getAdaptivePublicEventView("solo-cup", { id: "c1", role: "captain" } as never, now);
    expect(view).toMatchObject({ viewer: { state: "wrong_role", cta: { kind: "disabled", label: "use_player_account" } } });
    expect(mocks.teamFindFirst).not.toHaveBeenCalled();
    expect(mocks.soloFindUnique).not.toHaveBeenCalled();
  });

  it("is unavailable while solo tournaments are switched off", async () => {
    vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "false");
    const view = await getAdaptivePublicEventView("solo-cup", player, now);
    expect(view).toMatchObject({ registration: { availability: "legacy" }, viewer: { cta: { kind: "disabled", label: "registration_unavailable" } } });
    expect(mocks.getSoloQuotaSnapshot).not.toHaveBeenCalled();
  });

  it("still renders when the slot counts cannot be read", async () => {
    mocks.getSoloQuotaSnapshot.mockRejectedValue(new Error("db down"));
    const view = await getAdaptivePublicEventView("solo-cup", null, now);
    expect(view).toMatchObject({ mode: "registration", registration: { mode: "solo" } });
    expect(view?.mode === "registration" && view.registration.solo).toMatchObject({ requiredPosition: "Goalkeeper", slots: null });
  });

  it("follows the registration window like any event", async () => {
    const view = await getAdaptivePublicEventView("solo-cup", player, new Date("2026-09-01T00:00:00Z"));
    expect(view).toMatchObject({ registration: { availability: "upcoming" }, viewer: { cta: { kind: "disabled", label: "registration_upcoming" } } });
  });
});

describe("getAdaptivePublicEventView for a team event", () => {
  it("is unchanged: team mode, no solo block, captain link", async () => {
    mocks.eventFindFirst.mockResolvedValue({ ...soloEvent, entryMode: "team", gameModeId: "mode-mlbb-5v5", gameId: "game-mobile-legends" });
    const view = await getAdaptivePublicEventView("solo-cup", { id: "c1", role: "captain" } as never, now);
    expect(view).toMatchObject({ registration: { mode: "team" } });
    expect(view?.mode === "registration" && view.registration.solo).toBeUndefined();
    expect(mocks.getSoloQuotaSnapshot).not.toHaveBeenCalled();
    expect(mocks.soloFindUnique).not.toHaveBeenCalled();
  });

  it("treats an event stored before the column existed as a team event", async () => {
    const { entryMode: _unused, ...legacy } = soloEvent;
    void _unused;
    mocks.eventFindFirst.mockResolvedValue({ ...legacy, gameModeId: "mode-mlbb-5v5" });
    const view = await getAdaptivePublicEventView("solo-cup", null, now);
    expect(view).toMatchObject({ registration: { mode: "team" } });
  });
});
