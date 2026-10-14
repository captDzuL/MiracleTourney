import { beforeEach, describe, expect, it, vi } from "vitest";

// adminUpdatePaymentSettingsAction (lib/actions/registration-actions.ts) writes one row for the whole platform,
// so only platform admins may call it. An organizer manages the QRIS of their own events instead.

const { headers, requireRole, revalidatePath, updatePaymentSettings, uploadImageAsset } = vi.hoisted(() => ({
  headers: vi.fn(),
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  updatePaymentSettings: vi.fn(),
  uploadImageAsset: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath, revalidateTag: vi.fn(), unstable_cache: <T>(fn: T) => fn }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/headers", () => ({ headers, cookies: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole }));
vi.mock("@/lib/observability/logger", () => ({ writeServerLog: vi.fn() }));
vi.mock("@/lib/platform/db", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/actions/shared/uploads", () => ({ uploadImageAsset, appendActionError: vi.fn() }));
vi.mock("@/lib/platform/settings-repository", () => ({ updatePaymentSettings }));
vi.mock("@/lib/actions/registration-v3-actions", () => ({}));
vi.mock("@/lib/registration/review-repository", () => ({
  approveTeamRegistrationRequest: vi.fn(),
  rejectTeamRegistrationRequest: vi.fn(),
}));
vi.mock("@/lib/registration/repository", () => ({
  createOrUpdateCaptainDraftTeam: vi.fn(),
  createTeamRegistrationRequest: vi.fn(),
  registerTeam: vi.fn(),
  updateTeamRegistrationProof: vi.fn(),
}));

import { adminUpdatePaymentSettingsAction } from "@/lib/actions/registration-actions";

type Role = "captain" | "organizer" | "platform_admin" | "admin";

function signInAs(role: Role | null) {
  const user = role ? { id: `${role}-1`, role, email: `${role}@test.com`, name: role, mustChangePassword: false } : null;
  requireRole.mockImplementation(async (asked: string) => (user && user.role === asked ? user : null));
}

function form(pairs: Record<string, string | File> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(pairs)) data.set(key, value);
  return data;
}

async function expectRedirect(action: Promise<unknown>, url: string) {
  await expect(action).rejects.toThrow(new Error(`REDIRECT:${url}`));
}

const OK_URL = "/admin?phase=payments&success=payment-settings-updated";
const ORGANIZER_ERROR = `/admin?phase=payments&error=${encodeURIComponent("Hanya admin platform yang dapat mengubah pengaturan QRIS global.")}`;

describe("adminUpdatePaymentSettingsAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    headers.mockRejectedValue(new Error("outside of a request scope"));
    updatePaymentSettings.mockResolvedValue(undefined);
  });

  it("sends an organizer back with a message and changes nothing, not even an upload", async () => {
    signInAs("organizer");

    await expectRedirect(
      adminUpdatePaymentSettingsAction(form({ qrisImageUrl: "https://attacker.example/qris.png", instructions: "Transfer ke saya", qrisImage: new File(["x"], "q.png", { type: "image/png" }) })),
      ORGANIZER_ERROR,
    );

    expect(uploadImageAsset).not.toHaveBeenCalled();
    expect(updatePaymentSettings).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["platform_admin", "admin"] as const)("lets a %s save the settings", async (role) => {
    signInAs(role);

    await expectRedirect(
      adminUpdatePaymentSettingsAction(form({ qrisImageUrl: "https://cdn.example/qris.png", instructions: "  Transfer ke rekening Miracle  " })),
      OK_URL,
    );

    expect(updatePaymentSettings).toHaveBeenCalledWith({ qrisImageUrl: "https://cdn.example/qris.png", instructions: "Transfer ke rekening Miracle" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("sends a visitor who is not signed in to the login page", async () => {
    signInAs(null);

    await expectRedirect(adminUpdatePaymentSettingsAction(form()), "/login");

    expect(updatePaymentSettings).not.toHaveBeenCalled();
  });

  it("sends a captain to the login page", async () => {
    signInAs("captain");

    await expectRedirect(adminUpdatePaymentSettingsAction(form()), "/login");

    expect(updatePaymentSettings).not.toHaveBeenCalled();
  });
});
