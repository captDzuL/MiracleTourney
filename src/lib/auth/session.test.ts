import { beforeEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.hoisted(() => vi.fn());
const getUserWithPasswordByEmail = vi.hoisted(() => vi.fn());
const getCaptainById = vi.hoisted(() => vi.fn());
const getUserByEmail = vi.hoisted(() => vi.fn());
const compare = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@/lib/platform/repository", () => ({
  getUserWithPasswordByEmail,
  getCaptainById,
  getUserByEmail,
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare,
  },
}));

describe("auth session hardening", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.JWT_SECRET = "unit-test-secret-with-32-characters!!";
  });

  it("rejects missing JWT_SECRET", async () => {
    delete process.env.JWT_SECRET;
    const { signIn } = await import("./session");
    const cookieStore = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };

    getUserWithPasswordByEmail.mockResolvedValue({
      id: "admin-1",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      passwordHash: "$hash",
    });
    cookiesMock.mockResolvedValue(cookieStore);

    await expect(signIn("admin@test.com", "secret123")).rejects.toThrow("JWT_SECRET");
  });

  it("rejects the placeholder JWT secret", async () => {
    process.env.JWT_SECRET = "miracle-tourney-jwt-secret-change-in-production-32chars-min";
    const { signIn } = await import("./session");
    const cookieStore = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };

    getUserWithPasswordByEmail.mockResolvedValue({
      id: "admin-1",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      passwordHash: "$hash",
    });
    cookiesMock.mockResolvedValue(cookieStore);

    await expect(signIn("admin@test.com", "secret123")).rejects.toThrow("JWT_SECRET");
  });

  it("gives admin a shorter cookie lifetime than captain", async () => {
    const { signIn } = await import("./session");
    const cookieStore = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
    cookiesMock.mockResolvedValue(cookieStore);

    getUserWithPasswordByEmail.mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      passwordHash: "$hash",
    });
    await signIn("admin@test.com", "secret123");

    getUserWithPasswordByEmail.mockResolvedValueOnce({
      id: "captain-1",
      email: "captain@test.com",
      name: "Captain",
      role: "captain",
      passwordHash: "$hash",
    });
    await signIn("captain@test.com", "secret123");

    const adminOptions = cookieStore.set.mock.calls[0][2];
    const captainOptions = cookieStore.set.mock.calls[1][2];

    expect(adminOptions.maxAge).toBeLessThan(captainOptions.maxAge);
  });

  it("expires the auth cookie explicitly on logout", async () => {
    const { signOut } = await import("./session");
    const cookieStore = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
    cookiesMock.mockResolvedValue(cookieStore);

    await signOut();

    expect(cookieStore.set).toHaveBeenCalledWith(
      "mfl_token",
      "",
      expect.objectContaining({
        maxAge: 0,
        path: "/",
      }),
    );
  });

  it("accepts any role from the allowed role list", async () => {
    const { requireAnyRole, signIn } = await import("./session");
    const cookieStore = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
    cookiesMock.mockResolvedValue(cookieStore);
    getCaptainById.mockResolvedValue(null);
    getUserByEmail.mockResolvedValue({
      id: "org-1",
      email: "organizer@test.com",
      name: "Organizer",
      role: "organizer",
    });
    getUserWithPasswordByEmail.mockResolvedValue({
      id: "org-1",
      email: "organizer@test.com",
      name: "Organizer",
      role: "organizer",
      passwordHash: "$hash",
    });

    await signIn("organizer@test.com", "secret123");
    cookieStore.get.mockReturnValue({ value: cookieStore.set.mock.calls[0][1] });

    await expect(requireAnyRole(["platform_admin", "organizer", "admin"])).resolves.toMatchObject({
      id: "org-1",
      role: "organizer",
    });
  });

  it("rejects a session role outside the allowed role list", async () => {
    const { requireAnyRole, signIn } = await import("./session");
    const cookieStore = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
    cookiesMock.mockResolvedValue(cookieStore);
    getCaptainById.mockResolvedValue(null);
    getUserByEmail.mockResolvedValue({
      id: "captain-1",
      email: "captain@test.com",
      name: "Captain",
      role: "captain",
    });
    getUserWithPasswordByEmail.mockResolvedValue({
      id: "captain-1",
      email: "captain@test.com",
      name: "Captain",
      role: "captain",
      passwordHash: "$hash",
    });

    await signIn("captain@test.com", "secret123");
    cookieStore.get.mockReturnValue({ value: cookieStore.set.mock.calls[0][1] });

    await expect(requireAnyRole(["platform_admin", "organizer", "admin"])).resolves.toBeNull();
  });

  it("rejects deactivated users before issuing a cookie", async () => {
    const { signIn } = await import("./session");
    const cookieStore = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
    cookiesMock.mockResolvedValue(cookieStore);
    getUserWithPasswordByEmail.mockResolvedValue({
      id: "captain-1",
      email: "captain@test.com",
      name: "Captain",
      role: "captain",
      passwordHash: "$hash",
      deactivatedAt: new Date(),
    });

    const result = await signIn("captain@test.com", "secret123");

    expect(result).toEqual({ ok: false, error: "Account is deactivated." });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("ignores existing cookies for deactivated users", async () => {
    const { getSessionUser, signIn } = await import("./session");
    const cookieStore = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
    cookiesMock.mockResolvedValue(cookieStore);
    getUserWithPasswordByEmail.mockResolvedValue({
      id: "captain-1",
      email: "captain@test.com",
      name: "Captain",
      role: "captain",
      passwordHash: "$hash",
    });

    await signIn("captain@test.com", "secret123");
    cookieStore.get.mockReturnValue({ value: cookieStore.set.mock.calls[0][1] });
    getCaptainById.mockResolvedValue({
      id: "captain-1",
      email: "captain@test.com",
      name: "Captain",
      role: "captain",
      deactivatedAt: new Date(),
    });

    await expect(getSessionUser()).resolves.toBeNull();
  });
});
