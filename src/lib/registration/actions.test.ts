import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getEventBySlug: vi.fn(),
  saveCaptainRegistrationDraft: vi.fn(),
  registerTeam: vi.fn(),
  createTeamRegistrationRequest: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  redirectToActiveLocale: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
}));

vi.mock("@/lib/auth/session", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/platform/repository", () => ({
  getEventBySlug: mocks.getEventBySlug,
  registerTeam: mocks.registerTeam,
  createTeamRegistrationRequest: mocks.createTeamRegistrationRequest,
}));
vi.mock("@/lib/registration/captain-repository", () => ({ saveCaptainRegistrationDraft: mocks.saveCaptainRegistrationDraft }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale: mocks.redirectToActiveLocale }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: mocks.revalidateTag }));

import { captainRegisterEventTeamAction } from "./actions";

function form(fields: Record<string, string>) {
  const value = new FormData();
  for (const [key, item] of Object.entries(fields)) value.set(key, item);
  return value;
}

const validFields = {
  eventId: "event-1",
  eventSlug: "event-two",
  name: "Foreign Team",
  tag: "FOR",
  captainIgn: "Captain One",
  captainUid: "captain-uid",
  captainContact: "081234567890",
};

describe("captain registration event identity boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "captain-1", role: "captain", name: "Captain One" });
    mocks.getEventBySlug.mockResolvedValue({ id: "event-2" });
    mocks.saveCaptainRegistrationDraft.mockResolvedValue("draft-b");
    mocks.registerTeam.mockResolvedValue({ id: "team-b" });
    mocks.createTeamRegistrationRequest.mockResolvedValue({ id: "request-b" });
  });

  it("denies mismatched event slug and ID before draft, registration, or payment writes", async () => {
    await expect(captainRegisterEventTeamAction(form(validFields))).rejects.toThrow(
      "REDIRECT:/events/event-two/register?error=invalid-registration",
    );

    expect(mocks.getEventBySlug).toHaveBeenCalledWith("event-two");
    expect(mocks.saveCaptainRegistrationDraft).not.toHaveBeenCalled();
    expect(mocks.registerTeam).not.toHaveBeenCalled();
    expect(mocks.createTeamRegistrationRequest).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("does not redirect arbitrary repository exception messages", async () => {
    mocks.getEventBySlug.mockResolvedValue({ id: "event-1" });
    mocks.saveCaptainRegistrationDraft.mockRejectedValue(new Error("Prisma P2028 db://secret stack"));

    await expect(captainRegisterEventTeamAction(form(validFields))).rejects.toThrow(
      "REDIRECT:/events/event-two/register?error=Pendaftaran%20gagal%20disimpan.",
    );
  });
});
