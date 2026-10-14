import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), teamCount: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/platform/db", () => ({ prisma: { team: { count: mocks.teamCount } } }));

import { getCaptainOnly, getCaptainOrPlayer, getCaptainOrTeamOwner, ownsATeam } from "./captain-access";

const captain = { id: "c1", role: "captain" };
const player = { id: "p1", role: "player" };

/** Makes requireRole answer for one role only, as the real one does. */
const signedInAs = (user: { id: string; role: string } | null) =>
  mocks.requireRole.mockImplementation(async (role: string) => (user && user.role === role ? user : null));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.teamCount.mockResolvedValue(0);
});

describe("getCaptainOrTeamOwner", () => {
  it("accepts a captain without looking at teams", async () => {
    signedInAs(captain);
    await expect(getCaptainOrTeamOwner()).resolves.toBe(captain);
    expect(mocks.teamCount).not.toHaveBeenCalled();
  });

  it("accepts a player who captains a team, and asks about that player's own teams", async () => {
    signedInAs(player);
    mocks.teamCount.mockResolvedValue(1);
    await expect(getCaptainOrTeamOwner()).resolves.toBe(player);
    expect(mocks.teamCount).toHaveBeenCalledWith({ where: { captainId: "p1" } });
  });

  it("refuses a player who captains nothing", async () => {
    signedInAs(player);
    await expect(getCaptainOrTeamOwner()).resolves.toBeNull();
  });

  it.each([null, { id: "o1", role: "organizer" }, { id: "a1", role: "platform_admin" }])("refuses %j", async (user) => {
    signedInAs(user);
    await expect(getCaptainOrTeamOwner()).resolves.toBeNull();
    expect(mocks.teamCount).not.toHaveBeenCalled();
  });
});

describe("getCaptainOnly", () => {
  it("accepts a captain and never a player, even one who captains a team", async () => {
    mocks.teamCount.mockResolvedValue(3);
    signedInAs(captain);
    await expect(getCaptainOnly()).resolves.toBe(captain);
    signedInAs(player);
    await expect(getCaptainOnly()).resolves.toBeNull();
    expect(mocks.teamCount).not.toHaveBeenCalled();
  });
});

describe("getCaptainOrPlayer", () => {
  it("accepts either role and nobody else", async () => {
    signedInAs(captain);
    await expect(getCaptainOrPlayer()).resolves.toBe(captain);
    signedInAs(player);
    await expect(getCaptainOrPlayer()).resolves.toBe(player);
    signedInAs({ id: "o1", role: "organizer" });
    await expect(getCaptainOrPlayer()).resolves.toBeNull();
    signedInAs(null);
    await expect(getCaptainOrPlayer()).resolves.toBeNull();
  });
});

describe("ownsATeam", () => {
  it("is true from one team up", async () => {
    mocks.teamCount.mockResolvedValue(2);
    await expect(ownsATeam("p1")).resolves.toBe(true);
    mocks.teamCount.mockResolvedValue(0);
    await expect(ownsATeam("p1")).resolves.toBe(false);
  });
});
