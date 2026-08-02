import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, requireRole, setMatchResult } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireRole: vi.fn(),
  setMatchResult: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireRole }));
vi.mock("@/lib/imports/team-import", () => ({}));
vi.mock("@/lib/platform/demo-store", () => ({ setMatchResult }));

import { adminUpdateMatchResultAction } from "./actions";

function resultFormData() {
  const formData = new FormData();
  formData.set("eventId", "event-kuroko-summer");
  formData.set("matchId", "match-kuroko-1");
  formData.set("homeScore", "21");
  formData.set("awayScore", "18");
  return formData;
}

describe("adminUpdateMatchResultAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue({ id: "admin-1", role: "admin" });
  });

  it("requires an admin session before changing match results", async () => {
    requireRole.mockResolvedValue(null);

    await expect(adminUpdateMatchResultAction(resultFormData())).rejects.toThrow("REDIRECT:/login");
    expect(setMatchResult).not.toHaveBeenCalled();
  });

  it("preserves the success redirect after saving a match result", async () => {
    setMatchResult.mockReturnValue({ id: "match-kuroko-1" });

    await expect(adminUpdateMatchResultAction(resultFormData())).rejects.toThrow(
      "REDIRECT:/admin?success=match-result-updated&match=match-kuroko-1",
    );
    expect(requireRole).toHaveBeenCalledWith("admin");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("preserves the not-found redirect when the match is missing", async () => {
    setMatchResult.mockReturnValue(null);

    await expect(adminUpdateMatchResultAction(resultFormData())).rejects.toThrow(
      "REDIRECT:/admin?error=Match%20not%20found.",
    );
  });
});
