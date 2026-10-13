import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  headers: vi.fn(),
  signIn: vi.fn(),
  getUserByEmail: vi.fn(),
  createPlayerAccount: vi.fn(),
  hash: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/auth/session", () => ({ signIn: mocks.signIn }));
vi.mock("@/lib/platform/repository", () => ({
  getUserByEmail: mocks.getUserByEmail,
  createPlayerAccount: mocks.createPlayerAccount,
}));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@/i18n/redirect", () => ({
  redirectToActiveLocale: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  getLocalizedRedirectPath: (path: string, locale: string) => `/${locale}${path}`,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/observability/logger", () => ({
  withServerActionLog: (_name: string, _route: string, run: () => unknown) => run(),
  writeServerLog: vi.fn(),
}));

import { playerSignUpAction } from "./player-signup-actions";

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  data.set("fullName", "Bima Kartika");
  data.set("email", "bima@example.com");
  data.set("password", "password123");
  data.set("whatsapp", "081234567890");
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

async function destination(data: FormData) {
  try {
    await playerSignUpAction(data);
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) return decodeURIComponent(message.slice("REDIRECT:".length).replace(/\+/g, " "));
    throw error;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "true");
  mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.5" }));
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.getUserByEmail.mockResolvedValue(null);
  mocks.hash.mockResolvedValue("$hashed");
  mocks.createPlayerAccount.mockResolvedValue({ userId: "player-1" });
  mocks.signIn.mockResolvedValue({ ok: true, user: { id: "player-1", role: "player" } });
});

afterEach(() => vi.unstubAllEnvs());

describe("playerSignUpAction", () => {
  it("creates the account, signs the player in and sends them to the player area", async () => {
    expect(await destination(form())).toBe("/player");
    expect(mocks.createPlayerAccount).toHaveBeenCalledWith({
      email: "bima@example.com",
      name: "Bima Kartika",
      passwordHash: "$hashed",
      whatsapp: "6281234567890",
    });
    expect(mocks.signIn).toHaveBeenCalledWith("bima@example.com", "password123");
  });

  it("returns to a safe return path, such as the solo event page", async () => {
    expect(await destination(form({ returnTo: "/events/solo-cup/register" }))).toBe("/events/solo-cup/register");
  });

  it("ignores an unsafe return path", async () => {
    expect(await destination(form({ returnTo: "https://evil.example/steal" }))).toBe("/player");
    expect(await destination(form({ returnTo: "//evil.example" }))).toBe("/player");
  });

  it("uses the locale chosen on the page", async () => {
    expect(await destination(form({ locale: "en" }))).toBe("/en/player");
  });

  it("refuses when solo tournaments are switched off, without touching anything", async () => {
    vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "false");
    expect(await destination(form())).toContain("/register?error=Pendaftaran pemain belum dibuka.");
    expect(mocks.createPlayerAccount).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it.each([
    [{ fullName: "A" }, "Nama lengkap minimal 2 karakter."],
    [{ email: "nope" }, "Format email tidak valid."],
    [{ password: "short" }, "Password minimal 8 karakter."],
    [{ whatsapp: "12" }, "Nomor WhatsApp tidak valid."],
  ])("sends invalid input %j back to the form with a message", async (override, message) => {
    const result = await destination(form(override));
    expect(result).toContain("/register?");
    expect(result).toContain("as=player");
    expect(result).toContain(`error=${message}`);
    expect(mocks.createPlayerAccount).not.toHaveBeenCalled();
  });

  it("stops after too many attempts from one address", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    expect(await destination(form())).toContain("Terlalu banyak percobaan pendaftaran");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("register:203.0.113.5", 5, 15 * 60 * 1000);
    expect(mocks.createPlayerAccount).not.toHaveBeenCalled();
  });

  it("rejects throwaway email domains", async () => {
    expect(await destination(form({ email: "someone@mailinator.com" }))).toContain("Email sementara tidak diizinkan");
    expect(mocks.createPlayerAccount).not.toHaveBeenCalled();
  });

  it("keeps one email to one role: a captain email cannot become a player", async () => {
    mocks.getUserByEmail.mockResolvedValue({ id: "captain-1", role: "captain" });
    expect(await destination(form())).toContain("Email ini sudah dipakai sebagai kapten.");
    expect(mocks.createPlayerAccount).not.toHaveBeenCalled();
  });

  it("asks an existing player to sign in", async () => {
    mocks.getUserByEmail.mockResolvedValue({ id: "player-9", role: "player" });
    expect(await destination(form())).toContain("Email ini sudah terdaftar. Coba login.");
  });

  it("does not tell the visitor that an organizer account exists", async () => {
    mocks.getUserByEmail.mockResolvedValue({ id: "org-1", role: "organizer" });
    const result = await destination(form());
    expect(result).toContain("Email ini sudah terdaftar. Coba login.");
    expect(result).not.toContain("organizer");
  });

  it("reports a failed sign-in after creating the account", async () => {
    mocks.signIn.mockResolvedValue({ ok: false, error: "x" });
    expect(await destination(form())).toContain("Akun berhasil dibuat, tapi login gagal");
  });

  it("reports a database failure without leaking details", async () => {
    mocks.createPlayerAccount.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432"));
    const result = await destination(form());
    expect(result).toContain("Gagal membuat akun.");
    expect(result).not.toContain("ECONNREFUSED");
  });

  it("never writes the WhatsApp number, email or password to the logs", async () => {
    const logger = await import("@/lib/observability/logger");
    await destination(form());
    expect(JSON.stringify((logger.writeServerLog as ReturnType<typeof vi.fn>).mock.calls)).not.toMatch(/081234567890|6281234567890|password123|bima@example/);
  });
});
