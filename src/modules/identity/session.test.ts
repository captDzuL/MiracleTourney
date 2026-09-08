import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

const cookiesMock = vi.hoisted(() => vi.fn());
const getUserById = vi.hoisted(() => vi.fn());
const getUserByEmail = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("./repository", () => ({
  getUserById,
  getUserByEmail,
  getUserWithPasswordByEmail: vi.fn(),
  getCaptainById: vi.fn(),
}));

async function signClaims(claims: { sub: string; role: string }) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
}

describe("identity session", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.JWT_SECRET = "unit-test-secret-with-32-characters!!";
  });

  it("resolves organizer JWT subject with user-by-id and never email lookup", async () => {
    const { getSessionActor } = await import("./session");
    const token = await signClaims({ sub: "org-1", role: "organizer" });
    const cookieStore = { get: vi.fn().mockReturnValue({ value: token }), set: vi.fn(), delete: vi.fn() };
    cookiesMock.mockResolvedValue(cookieStore);

    getUserById.mockResolvedValue({
      id: "org-1",
      email: "organizer@test.com",
      name: "Organizer",
      role: "organizer",
    });

    await expect(getSessionActor()).resolves.toEqual({
      userId: "org-1",
      role: "organizer",
      tenantId: "org-1",
    });
    expect(getUserById).toHaveBeenCalledWith("org-1");
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("does not elevate organizer to platform_admin from stale JWT role claim", async () => {
    const { requireRole } = await import("./session");
    const token = await signClaims({ sub: "org-1", role: "platform_admin" });
    const cookieStore = { get: vi.fn().mockReturnValue({ value: token }), set: vi.fn(), delete: vi.fn() };
    cookiesMock.mockResolvedValue(cookieStore);

    getUserById.mockResolvedValue({
      id: "org-1",
      email: "organizer@test.com",
      name: "Organizer",
      role: "organizer",
    });

    await expect(requireRole("platform_admin")).resolves.toBeNull();
  });
});
