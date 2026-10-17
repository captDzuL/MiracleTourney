import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  isFeatureEnabled: vi.fn(),
  checkRateLimit: vi.fn(),
  savePlayerWhatsapp: vi.fn(),
  revalidatePath: vi.fn(),
  writeServerLog: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/player/profile-repository", () => ({ savePlayerWhatsapp: mocks.savePlayerWhatsapp }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("./locale-redirect", () => ({
  redirectToLocale: (path: string, locale: string): never => {
    throw new Error(`REDIRECT:${locale ? `/${locale}` : ""}${path}`);
  },
}));
vi.mock("@/lib/observability/logger", () => ({
  withServerActionLog: (_name: string, _route: string, run: () => unknown) => run(),
  writeServerLog: mocks.writeServerLog,
}));

import { updatePlayerProfileAction } from "./player-profile-actions";

const player = { id: "player-1", role: "player", name: "Bima" };

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};

async function destination(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) return decodeURIComponent(message.slice("REDIRECT:".length).replace(/\+/g, " "));
    throw error;
  }
  return "no redirect";
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isFeatureEnabled.mockReturnValue(true);
  mocks.requireRole.mockResolvedValue(player);
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.savePlayerWhatsapp.mockResolvedValue(undefined);
});

describe("updatePlayerProfileAction", () => {
  it("saves the number as digits with the country code, for the signed-in player, and says so", async () => {
    const result = await destination(() => updatePlayerProfileAction(form({ whatsapp: "0812 3456 7890", locale: "en", userId: "someone-else" })));

    expect(result).toBe("/en/player/profile?success=saved");
    expect(mocks.savePlayerWhatsapp).toHaveBeenCalledWith("player-1", "6281234567890");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/player/profile");
  });

  it("refuses a number that is not a phone number, without touching the profile", async () => {
    for (const whatsapp of ["", "abc", "123", "+1 202 555 0100", "0812<script>"]) {
      await expect(destination(() => updatePlayerProfileAction(form({ whatsapp, locale: "id" })))).resolves.toBe("/id/player/profile?error=invalid-whatsapp");
    }
    expect(mocks.savePlayerWhatsapp).not.toHaveBeenCalled();
  });

  it("is closed while solo tournaments are switched off, and to everybody but a player", async () => {
    mocks.isFeatureEnabled.mockReturnValue(false);
    await expect(destination(() => updatePlayerProfileAction(form({ whatsapp: "081234567890", locale: "id" })))).resolves.toBe("/id/login");
    mocks.isFeatureEnabled.mockReturnValue(true);
    mocks.requireRole.mockResolvedValue(null);
    await expect(destination(() => updatePlayerProfileAction(form({ whatsapp: "081234567890", locale: "id" })))).resolves.toBe("/id/login");
    expect(mocks.requireRole).toHaveBeenCalledWith("player");
    expect(mocks.savePlayerWhatsapp).not.toHaveBeenCalled();
  });

  it("limits how often a player can save", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    await expect(destination(() => updatePlayerProfileAction(form({ whatsapp: "081234567890", locale: "id" })))).resolves.toBe("/id/player/profile?error=too-many");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("player-profile:player-1", 10, 15 * 60 * 1000);
    expect(mocks.savePlayerWhatsapp).not.toHaveBeenCalled();
  });

  it("hides a failure's details from the page, and logs only its class", async () => {
    mocks.savePlayerWhatsapp.mockRejectedValue(new Error('connection to "postgres://user:secret@host" refused'));

    const result = await destination(() => updatePlayerProfileAction(form({ whatsapp: "081234567890", locale: "id" })));

    expect(result).toBe("/id/player/profile?error=save-failed");
    expect(result).not.toContain("secret");
    expect(mocks.writeServerLog).toHaveBeenCalledWith(expect.objectContaining({ phase: "failed", status: 500, errorCode: "Error" }));
    expect(JSON.stringify(mocks.writeServerLog.mock.calls)).not.toContain("secret");
  });
});
