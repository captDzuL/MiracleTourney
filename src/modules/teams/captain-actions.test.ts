import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  addPlayer,
  assertCaptainCanManageTeam,
  deletePlayer,
  redirectToActiveLocale,
  requireRole,
  revalidatePath,
  revalidateTag,
  setTeamCaptainDisplay,
  updateCaptainTeamLogo,
  updatePlayer,
  uploadTeamLogoImage,
} = vi.hoisted(() => ({
  addPlayer: vi.fn(),
  assertCaptainCanManageTeam: vi.fn(),
  deletePlayer: vi.fn(),
  redirectToActiveLocale: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  setTeamCaptainDisplay: vi.fn(),
  updateCaptainTeamLogo: vi.fn(),
  updatePlayer: vi.fn(),
  uploadTeamLogoImage: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireRole }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale }));
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
vi.mock("./service", () => ({
  addPlayer,
  assertCaptainCanManageTeam,
  deletePlayer,
  setTeamCaptainDisplay,
  updateCaptainTeamLogo,
  updatePlayer,
}));
vi.mock("./upload", () => ({ uploadTeamLogoImage }));

import {
  captainAddPlayerAction,
  captainDeletePlayerAction,
  captainSetDisplayCaptainAction,
  captainUpdatePlayerAction,
  captainUploadTeamLogoAction,
} from "./actions";

function fd(entries: Record<string, string | File>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
}

describe("captain teams actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue({ id: "captain-1", role: "captain", email: "captain@test.com", name: "Captain" });
    assertCaptainCanManageTeam.mockResolvedValue({ eventId: "event-1" });
    uploadTeamLogoImage.mockResolvedValue({ url: "/team-logos/team-1.png", mimeType: "image/png", width: 16, height: 9 });
  });

  it("authorizes before captain logo upload and writes with the authenticated captain", async () => {
    await expect(captainUploadTeamLogoAction(fd({ teamId: "team-1", teamLogo: new File(["x"], "logo.png") })))
      .rejects.toThrow("REDIRECT:/captain?tab=roster&success=team-logo-updated");

    expect(assertCaptainCanManageTeam).toHaveBeenCalledWith("captain-1", "team-1");
    expect(assertCaptainCanManageTeam.mock.invocationCallOrder[0]).toBeLessThan(uploadTeamLogoImage.mock.invocationCallOrder[0]);
    expect(uploadTeamLogoImage.mock.invocationCallOrder[0]).toBeLessThan(updateCaptainTeamLogo.mock.invocationCallOrder[0]);
    expect(updateCaptainTeamLogo).toHaveBeenCalledWith("captain-1", "team-1", "/team-logos/team-1.png");
    expect(revalidateTag).toHaveBeenCalledWith("teams");
    expect(revalidatePath).toHaveBeenCalledWith("/captain");
  });

  it("does not upload or mutate a forged captain team", async () => {
    assertCaptainCanManageTeam.mockRejectedValue(new Error("Not authorized"));

    await expect(captainUploadTeamLogoAction(fd({ teamId: "team-b", teamLogo: new File(["x"], "logo.png") })))
      .rejects.toThrow("REDIRECT:/captain?tab=roster&error=Not%20authorized");

    expect(uploadTeamLogoImage).not.toHaveBeenCalled();
    expect(updateCaptainTeamLogo).not.toHaveBeenCalled();
  });

  it("requires a captain session before captain mutations", async () => {
    requireRole.mockResolvedValue(null);

    await expect(captainAddPlayerAction(fd({
      teamId: "team-1",
      displayName: "Player",
      nickname: "IGN",
    }))).rejects.toThrow("REDIRECT:/login");
    expect(addPlayer).not.toHaveBeenCalled();
  });

  it("preserves captain mutation error redirects without revalidation", async () => {
    updatePlayer.mockRejectedValueOnce(new Error("Not authorized"));

    await expect(captainUpdatePlayerAction(fd({
      playerId: "player-b",
      displayName: "Updated",
      nickname: "UPD",
    }))).rejects.toThrow("REDIRECT:/captain?error=Tidak+dapat+mengedit+pemain+ini.");

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps add, update, delete, and display action compatibility", async () => {
    await expect(captainAddPlayerAction(fd({
      teamId: "team-1",
      eventId: "event-1",
      displayName: " Player ",
      nickname: " IGN ",
      position: " Sub ",
      jerseyNumber: "7",
    }))).rejects.toThrow("REDIRECT:/captain?success=player-added");
    expect(addPlayer).toHaveBeenCalledWith("captain-1", {
      teamId: "team-1",
      eventId: "event-1",
      displayName: "Player",
      nickname: "IGN",
      position: "Sub",
      jerseyNumber: 7,
    });

    await expect(captainUpdatePlayerAction(fd({
      playerId: "player-1",
      displayName: "Updated",
      nickname: "UPD",
      position: "",
    }))).rejects.toThrow("REDIRECT:/captain?success=player-updated");
    expect(updatePlayer).toHaveBeenCalledWith("player-1", "captain-1", expect.objectContaining({ displayName: "Updated" }));
    expect(revalidatePath).toHaveBeenCalledWith("/captain");

    await expect(captainDeletePlayerAction(fd({ playerId: "player-1" })))
      .rejects.toThrow("REDIRECT:/captain?success=player-deleted");
    expect(deletePlayer).toHaveBeenCalledWith("player-1", "captain-1");

    await expect(captainSetDisplayCaptainAction(fd({ teamId: "team-1", playerId: "player-1", displayName: "Injected" })))
      .rejects.toThrow("REDIRECT:/captain?success=captain-display-updated");
    expect(setTeamCaptainDisplay).toHaveBeenCalledWith("team-1", "captain-1", "player-1");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});