import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({
  flag: vi.fn(),
  session: vi.fn(),
  manage: vi.fn(),
  deps: vi.fn(),
  regenerate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: external.flag }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: external.session }));
vi.mock("@/lib/platform/repository", () => ({ assertUserCanManageEvent: external.manage, getCertificateByEvent: vi.fn() }));
vi.mock("@/lib/certificate/studio-repository", () => ({ createPrismaCertificateStudioDependencies: external.deps }));
vi.mock("@/lib/certificate/service", async (load) => {
  const actual = await load<typeof import("@/lib/certificate/service")>();
  return { ...actual, regenerateCertificate: external.regenerate };
});

import {
  CERTIFICATE_REGENERATION_RATE_LIMIT,
  CERTIFICATE_REGENERATION_RATE_LIMIT_WINDOW_MS,
  regenerateCertificateAction,
} from "./certificate-v3-actions";

const input = (eventId: string, idempotencyKey = crypto.randomUUID()) => ({
  eventId,
  certificateType: "champion",
  expectedVersion: 4,
  idempotencyKey,
});

describe("certificate regeneration rate limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00.000Z"));
    vi.clearAllMocks();
    external.flag.mockReturnValue(true);
    external.session.mockResolvedValue({ id: "organizer-rate-limit", role: "organizer", mustChangePassword: false });
    external.manage.mockResolvedValue(undefined);
    external.deps.mockReturnValue({});
    external.regenerate.mockResolvedValue({
      status: "generated",
      certificateId: "cert-champion",
      certificateType: "champion",
      version: 1,
      imageUrl: "/certificates/champion.png",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows twenty certificate generations including publication and supersession, then blocks the twenty-first attempt", async () => {
    const eventId = `certificate-rate-limit-${crypto.randomUUID()}`;
    expect(CERTIFICATE_REGENERATION_RATE_LIMIT).toBe(20);
    expect(CERTIFICATE_REGENERATION_RATE_LIMIT_WINDOW_MS).toBe(5 * 60 * 1000);

    for (let attempt = 0; attempt < CERTIFICATE_REGENERATION_RATE_LIMIT; attempt += 1) {
      await expect(regenerateCertificateAction(input(eventId))).resolves.toMatchObject({ status: "generated" });
    }
    await expect(regenerateCertificateAction(input(eventId))).resolves.toEqual({ status: "blocked", code: "rate_limited" });

    expect(external.regenerate).toHaveBeenCalledTimes(CERTIFICATE_REGENERATION_RATE_LIMIT);
  });

  it("resets after five minutes and keeps actor/event buckets independent", async () => {
    const firstEventId = `certificate-rate-limit-a-${crypto.randomUUID()}`;
    const secondEventId = `certificate-rate-limit-b-${crypto.randomUUID()}`;

    for (let attempt = 0; attempt < CERTIFICATE_REGENERATION_RATE_LIMIT; attempt += 1) {
      await expect(regenerateCertificateAction(input(firstEventId))).resolves.toMatchObject({ status: "generated" });
    }
    await expect(regenerateCertificateAction(input(firstEventId))).resolves.toEqual({ status: "blocked", code: "rate_limited" });

    await expect(regenerateCertificateAction(input(secondEventId))).resolves.toMatchObject({ status: "generated" });
    external.session.mockResolvedValue({ id: "another-organizer", role: "organizer", mustChangePassword: false });
    await expect(regenerateCertificateAction(input(firstEventId))).resolves.toMatchObject({ status: "generated" });

    vi.advanceTimersByTime(CERTIFICATE_REGENERATION_RATE_LIMIT_WINDOW_MS + 1);
    external.session.mockResolvedValue({ id: "organizer-rate-limit", role: "organizer", mustChangePassword: false });
    await expect(regenerateCertificateAction(input(firstEventId))).resolves.toMatchObject({ status: "generated" });
  });
});
