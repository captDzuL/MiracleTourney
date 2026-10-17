import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platform/db", () => ({ prisma: { playerProfile: { findUnique, upsert } } }));

import { getPlayerWhatsapp, savePlayerWhatsapp } from "./profile-repository";

beforeEach(() => vi.clearAllMocks());

describe("getPlayerWhatsapp", () => {
  it("reads only the number, for the given account", async () => {
    findUnique.mockResolvedValue({ whatsapp: "6281234567890" });
    await expect(getPlayerWhatsapp("user-1")).resolves.toBe("6281234567890");
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: "user-1" }, select: { whatsapp: true } });
  });

  it("answers undefined for an account without a profile", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getPlayerWhatsapp("user-1")).resolves.toBeUndefined();
  });
});

describe("savePlayerWhatsapp", () => {
  it("creates the profile or replaces the number, for that account only", async () => {
    upsert.mockResolvedValue({});
    await savePlayerWhatsapp("user-1", "6281234567890");
    expect(upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: { userId: "user-1", whatsapp: "6281234567890" },
      update: { whatsapp: "6281234567890" },
    });
  });
});
