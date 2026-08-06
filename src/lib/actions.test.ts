import { beforeEach, describe, expect, it, vi } from "vitest";

const { addPlayer, autoTransitionEventToOngoing, registerTeam, revalidatePath, revalidateTag, requireRole, setMatchResult } = vi.hoisted(() => ({
  addPlayer: vi.fn(),
  autoTransitionEventToOngoing: vi.fn(),
  registerTeam: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  requireRole: vi.fn(),
  setMatchResult: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireRole }));
vi.mock("@/lib/imports/team-import", () => ({}));
vi.mock("@/lib/platform/repository", () => ({ addPlayer, autoTransitionEventToOngoing, registerTeam, setMatchResult }));

import {
  adminUpdateMatchResultAction,
  captainAddPlayerAction,
  captainRegisterTeamAction,
} from "./actions";

function resultFormData() {
  const formData = new FormData();
  formData.set("eventId", "event-kuroko-summer");
  formData.set("matchEventId", "event-kuroko-summer");
  formData.set("matchId", "match-kuroko-1");
  formData.set("homeScore", "21");
  formData.set("awayScore", "18");
  return formData;
}

function registrationFormData() {
  const formData = new FormData();
  formData.set("eventId", "event-flashpeak-open");
  formData.set("captainId", "captain-attacker-controlled");
  formData.set("name", "Session United");
  formData.set("tag", "SES");
  return formData;
}

function playerFormData() {
  const formData = new FormData();
  formData.set("teamId", "team-seirin");
  formData.set("eventId", "event-kuroko-summer");
  formData.set("displayName", "Authenticated Player");
  formData.set("nickname", "Auth");
  formData.set("position", "Guard");
  return formData;
}

describe("captain actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue({ id: "captain-session", role: "captain" });
  });

  it("requires a captain session before registering a team", async () => {
    requireRole.mockResolvedValue(null);

    await expect(captainRegisterTeamAction(registrationFormData())).rejects.toThrow(
      "REDIRECT:/login",
    );
    expect(registerTeam).not.toHaveBeenCalled();
  });

  it("derives the registering captain from the authenticated session", async () => {
    await expect(captainRegisterTeamAction(registrationFormData())).rejects.toThrow(
      "REDIRECT:/captain?success=team-created",
    );
    expect(requireRole).toHaveBeenCalledWith("captain");
    expect(registerTeam).toHaveBeenCalledWith({
      eventId: "event-flashpeak-open",
      captainId: "captain-session",
      name: "Session United",
      tag: "SES",
    });
  });

  it("requires a captain session before adding a player", async () => {
    requireRole.mockResolvedValue(null);

    await expect(captainAddPlayerAction(playerFormData())).rejects.toThrow("REDIRECT:/login");
    expect(addPlayer).not.toHaveBeenCalled();
  });
});

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
      "REDIRECT:/admin?matchEventId=event-kuroko-summer&success=match-result-updated",
    );
    expect(requireRole).toHaveBeenCalledWith("admin");
    expect(autoTransitionEventToOngoing).toHaveBeenCalledWith("event-kuroko-summer");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("preserves the not-found redirect when the match is missing", async () => {
    setMatchResult.mockReturnValue(null);

    await expect(adminUpdateMatchResultAction(resultFormData())).rejects.toThrow(
      "REDIRECT:/admin?matchEventId=event-kuroko-summer&error=Match%20not%20found.",
    );
  });
});
