import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  isFeatureEnabled: vi.fn(),
  assertUserCanManageEvent: vi.fn(),
  drawFindUnique: vi.fn(),
  registrationFindUnique: vi.fn(),
  revalidateTag: vi.fn(),
  writeServerLog: vi.fn(),
  checkRateLimit: vi.fn(),
  closeSoloRegistration: vi.fn(),
  createSoloDraw: vi.fn(),
  swapSoloPlayers: vi.fn(),
  lockSoloDraw: vi.fn(),
  markSoloRefunded: vi.fn(),
  approveSolo: vi.fn(),
  rejectSolo: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole: mocks.requireAnyRole }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));
vi.mock("@/lib/platform/shared/authz", () => ({ assertUserCanManageEvent: mocks.assertUserCanManageEvent }));
vi.mock("@/lib/solo/lookups", () => ({
  findSoloDrawEvent: mocks.drawFindUnique,
  findSoloRegistrationEvent: mocks.registrationFindUnique,
}));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/observability/logger", () => ({ withServerActionLog: (_name: string, _route: string, run: () => unknown) => run(), writeServerLog: mocks.writeServerLog }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/solo/close-registration", () => ({ closeSoloRegistration: mocks.closeSoloRegistration }));
vi.mock("@/lib/solo/draw-repository", () => ({
  createSoloDraw: mocks.createSoloDraw,
  swapSoloPlayers: mocks.swapSoloPlayers,
  lockSoloDraw: mocks.lockSoloDraw,
  markSoloRefunded: mocks.markSoloRefunded,
}));
vi.mock("@/lib/solo/registration-repository", () => ({ approveSolo: mocks.approveSolo, rejectSolo: mocks.rejectSolo }));

import { UserFacingError } from "@/lib/security/public-error";
import {
  approveSoloRegistrationAction,
  closeSoloRegistrationAction,
  createSoloDrawAction,
  lockSoloDrawAction,
  markSoloRefundedAction,
  rejectSoloRegistrationAction,
  swapSoloPlayersAction,
} from "./solo-organizer-actions";

const organizer = { id: "org-1", role: "organizer", name: "Org", mustChangePassword: false };
const SEEN = "2026-10-13T10:00:00.000Z";

function form(entries: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isFeatureEnabled.mockReturnValue(true);
  mocks.requireAnyRole.mockResolvedValue(organizer);
  mocks.assertUserCanManageEvent.mockResolvedValue(undefined);
  mocks.drawFindUnique.mockResolvedValue({ eventId: "event-1" });
  mocks.registrationFindUnique.mockResolvedValue({ eventId: "event-1" });
  mocks.checkRateLimit.mockResolvedValue(true);
});

/** Every action, with a valid form, and what it must ask the repository. */
const actions = [
  ["close registration", () => closeSoloRegistrationAction(form({ eventId: "event-1", expectedVersion: "4", confirmRefundId: ["reg-1", "reg-2"] })), mocks.closeSoloRegistration],
  ["draw", () => createSoloDrawAction(form({ eventId: "event-1" })), mocks.createSoloDraw],
  ["swap", () => swapSoloPlayersAction(form({ drawId: "draw-1", a: "reg-1", b: "reg-2", expectedUpdatedAt: SEEN })), mocks.swapSoloPlayers],
  ["lock", () => lockSoloDrawAction(form({ drawId: "draw-1", expectedUpdatedAt: SEEN })), mocks.lockSoloDraw],
  ["approve", () => approveSoloRegistrationAction(form({ registrationId: "reg-1", version: "2" })), mocks.approveSolo],
  ["reject", () => rejectSoloRegistrationAction(form({ registrationId: "reg-1", version: "2", reason: "Bukti buram" })), mocks.rejectSolo],
  ["refund", () => markSoloRefundedAction(form({ registrationId: "reg-1", note: "Transfer ulang" })), mocks.markSoloRefunded],
] as const;

describe.each(actions)("%s", (_name, call, repository) => {
  it("is closed while solo tournaments are switched off", async () => {
    mocks.isFeatureEnabled.mockReturnValue(false);
    await expect(call()).resolves.toEqual({ status: "failed", message: "Fitur solo belum dibuka." });
    expect(repository).not.toHaveBeenCalled();
  });

  it("needs a signed-in organizer or admin who has changed the first password", async () => {
    mocks.requireAnyRole.mockResolvedValue(null);
    await expect(call()).resolves.toMatchObject({ status: "failed" });
    mocks.requireAnyRole.mockResolvedValue({ ...organizer, mustChangePassword: true });
    await expect(call()).resolves.toMatchObject({ status: "failed", message: "Ganti password sebelum mengelola event." });
    expect(repository).not.toHaveBeenCalled();
  });

  it("is refused for an event the organizer does not manage", async () => {
    mocks.assertUserCanManageEvent.mockRejectedValue(new Error("Not authorized"));
    await expect(call()).resolves.toEqual({ status: "failed", message: "Kamu tidak punya akses ke data ini." });
    expect(mocks.assertUserCanManageEvent).toHaveBeenCalledWith(organizer, "event-1");
    expect(repository).not.toHaveBeenCalled();
  });

  it("shows the refusal of the repository as it is written", async () => {
    repository.mockRejectedValue(new UserFacingError("Pendaftar berubah. Acak ulang dulu."));
    await expect(call()).resolves.toEqual({ status: "failed", message: "Pendaftar berubah. Acak ulang dulu." });
  });

  it("calls stale data a conflict, so the screen can reload", async () => {
    repository.mockRejectedValue(new UserFacingError("Data sudah berubah. Muat ulang halaman."));
    await expect(call()).resolves.toMatchObject({ status: "conflict" });
  });

  it("never shows an unexpected error's text, and logs only its class", async () => {
    repository.mockRejectedValue(new Error('duplicate key value violates unique constraint "secret_index"'));
    const result = await call();
    expect(result.status).toBe("failed");
    expect(JSON.stringify(result)).not.toContain("secret_index");
    expect(mocks.writeServerLog).toHaveBeenCalledWith(expect.objectContaining({ phase: "failed", status: 500, errorCode: "Error" }));
    expect(JSON.stringify(mocks.writeServerLog.mock.calls)).not.toContain("secret_index");
  });

  it("does not look anything up for a caller who is not an organizer", async () => {
    mocks.requireAnyRole.mockResolvedValue(null);
    await call();
    mocks.isFeatureEnabled.mockReturnValue(false);
    await call();
    expect(mocks.drawFindUnique).not.toHaveBeenCalled();
    expect(mocks.registrationFindUnique).not.toHaveBeenCalled();
    expect(mocks.assertUserCanManageEvent).not.toHaveBeenCalled();
  });

  it("reports success", async () => {
    repository.mockResolvedValue(undefined);
    await expect(call()).resolves.toMatchObject({ status: "ok" });
  });
});

describe("what each action hands to the repository", () => {
  it("closes with the version it was loaded with and only well-formed refund ids", async () => {
    mocks.closeSoloRegistration.mockResolvedValue(undefined);
    await closeSoloRegistrationAction(form({ eventId: "event-1", expectedVersion: "4", confirmRefundId: ["reg-1", "../bad", "reg-2"] }));
    expect(mocks.closeSoloRegistration).toHaveBeenCalledWith({
      actor: organizer, eventId: "event-1", confirmRefundIds: ["reg-1", "reg-2"], expectedCompetitionVersion: 4,
    });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("events");
  });

  it("rejects a version that is not a whole number", async () => {
    for (const expectedVersion of ["", "x", "-1", "1.5"]) {
      await expect(closeSoloRegistrationAction(form({ eventId: "event-1", expectedVersion }))).resolves.toEqual({ status: "failed", message: "Data tidak valid." });
    }
    await expect(approveSoloRegistrationAction(form({ registrationId: "reg-1", version: "nope" }))).resolves.toMatchObject({ status: "failed" });
    expect(mocks.closeSoloRegistration).not.toHaveBeenCalled();
    expect(mocks.approveSolo).not.toHaveBeenCalled();
  });

  it("stops drawing again and again, and says so", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    await expect(createSoloDrawAction(form({ eventId: "event-1" }))).resolves.toEqual({ status: "failed", message: "Terlalu sering mengacak. Tunggu semenit lalu coba lagi." });
    expect(mocks.createSoloDraw).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("solo-draw:org-1:event-1", 10, 60_000);
  });

  it("draws with an optional seed", async () => {
    mocks.createSoloDraw.mockResolvedValue({});
    await createSoloDrawAction(form({ eventId: "event-1", seed: " my seed " }));
    expect(mocks.createSoloDraw).toHaveBeenLastCalledWith({ actor: organizer, eventId: "event-1", seed: "my seed" });
    await createSoloDrawAction(form({ eventId: "event-1" }));
    expect(mocks.createSoloDraw).toHaveBeenLastCalledWith({ actor: organizer, eventId: "event-1" });
  });

  it("checks access against the event the draw or registration belongs to, not one the form names", async () => {
    mocks.drawFindUnique.mockResolvedValue({ eventId: "event-of-draw" });
    mocks.lockSoloDraw.mockResolvedValue({ teamIds: [] });
    await lockSoloDrawAction(form({ drawId: "draw-1", eventId: "my-own-event", expectedUpdatedAt: SEEN }));
    expect(mocks.assertUserCanManageEvent).toHaveBeenCalledWith(organizer, "event-of-draw");

    mocks.registrationFindUnique.mockResolvedValue({ eventId: "event-of-registration" });
    mocks.approveSolo.mockResolvedValue({});
    await approveSoloRegistrationAction(form({ registrationId: "reg-1", version: "1", eventId: "my-own-event" }));
    expect(mocks.assertUserCanManageEvent).toHaveBeenLastCalledWith(organizer, "event-of-registration");
  });

  it("answers a missing id like an event that is not the organizer's, so ids cannot be probed", async () => {
    mocks.drawFindUnique.mockResolvedValue(null);
    mocks.registrationFindUnique.mockResolvedValue(null);
    const noAccess = { status: "failed", message: "Kamu tidak punya akses ke data ini." };
    await expect(lockSoloDrawAction(form({ drawId: "gone", expectedUpdatedAt: SEEN }))).resolves.toEqual(noAccess);
    await expect(markSoloRefundedAction(form({ registrationId: "gone" }))).resolves.toEqual(noAccess);
    mocks.drawFindUnique.mockResolvedValue({ eventId: "event-1" });
    mocks.assertUserCanManageEvent.mockRejectedValue(new Error("Not authorized"));
    await expect(lockSoloDrawAction(form({ drawId: "real", expectedUpdatedAt: SEEN }))).resolves.toEqual(noAccess);
    await expect(lockSoloDrawAction(form({ drawId: "../etc", expectedUpdatedAt: SEEN }))).resolves.toMatchObject({ status: "failed" });
    expect(mocks.lockSoloDraw).not.toHaveBeenCalled();
  });

  it("refreshes teams and events after teams are locked, not after a swap", async () => {
    mocks.lockSoloDraw.mockResolvedValue({ teamIds: [] });
    mocks.swapSoloPlayers.mockResolvedValue({});
    await swapSoloPlayersAction(form({ drawId: "draw-1", a: "reg-1", b: "reg-2", expectedUpdatedAt: SEEN }));
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    await lockSoloDrawAction(form({ drawId: "draw-1", expectedUpdatedAt: SEEN }));
    expect(mocks.revalidateTag).toHaveBeenCalledWith("teams");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("events");
  });

  it("rejects a swap that names a malformed player", async () => {
    await expect(swapSoloPlayersAction(form({ drawId: "draw-1", a: "reg-1", b: "x y", expectedUpdatedAt: SEEN }))).resolves.toEqual({ status: "failed", message: "Data tidak valid." });
    expect(mocks.swapSoloPlayers).not.toHaveBeenCalled();
  });

  it("needs the time the screen saw the draw, written exactly, for a swap and a lock", async () => {
    for (const expectedUpdatedAt of ["", "yesterday", "2026-10-13", "2026-10-13T10:00:00Z", "2026-13-45T10:00:00.000Z"]) {
      await expect(swapSoloPlayersAction(form({ drawId: "draw-1", a: "reg-1", b: "reg-2", expectedUpdatedAt }))).resolves.toEqual({ status: "failed", message: "Data tidak valid." });
      await expect(lockSoloDrawAction(form({ drawId: "draw-1", expectedUpdatedAt }))).resolves.toEqual({ status: "failed", message: "Data tidak valid." });
    }
    await expect(lockSoloDrawAction(form({ drawId: "draw-1" }))).resolves.toMatchObject({ status: "failed" });
    expect(mocks.swapSoloPlayers).not.toHaveBeenCalled();
    expect(mocks.lockSoloDraw).not.toHaveBeenCalled();
  });

  it("hands the time the screen saw to a swap and a lock", async () => {
    mocks.swapSoloPlayers.mockResolvedValue({});
    mocks.lockSoloDraw.mockResolvedValue({ teamIds: [] });
    await swapSoloPlayersAction(form({ drawId: "draw-1", a: "reg-1", b: "reg-2", expectedUpdatedAt: SEEN }));
    await lockSoloDrawAction(form({ drawId: "draw-1", expectedUpdatedAt: SEEN }));
    expect(mocks.swapSoloPlayers).toHaveBeenCalledWith({ actor: organizer, drawId: "draw-1", a: "reg-1", b: "reg-2", expectedUpdatedAt: new Date(SEEN) });
    expect(mocks.lockSoloDraw).toHaveBeenCalledWith({ actor: organizer, drawId: "draw-1", expectedUpdatedAt: new Date(SEEN) });
  });

  it("passes the reason and version to a rejection", async () => {
    mocks.rejectSolo.mockResolvedValue({});
    await rejectSoloRegistrationAction(form({ registrationId: "reg-1", version: "7", reason: "  Bukti buram  " }));
    expect(mocks.rejectSolo).toHaveBeenCalledWith({ actor: organizer, registrationId: "reg-1", reason: "Bukti buram", expectedVersion: 7 });
  });
});
