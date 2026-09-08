import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError, ForbiddenError, NotFoundError } from "@/modules/identity";

const {
  requireAnyRole,
  redirectToActiveLocale,
  revalidatePath,
  revalidateTag,
  assertActorCanManageTeam,
  assignCaptainForActor,
  deleteTeamForActor,
  updateTeamLogoForActor,
  uploadTeamLogoImage,
} = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  redirectToActiveLocale: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  assertActorCanManageTeam: vi.fn(),
  assignCaptainForActor: vi.fn(),
  deleteTeamForActor: vi.fn(),
  updateTeamLogoForActor: vi.fn(),
  uploadTeamLogoImage: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale }));
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
vi.mock("./service", () => ({
  assertActorCanManageTeam,
  assignCaptainForActor,
  deleteTeamForActor,
  updateTeamLogoForActor,
}));
vi.mock("./upload", () => ({ uploadTeamLogoImage }));

import { adminAssignCaptainAction, adminDeleteTeamAction, adminUploadTeamLogoAction } from "./actions";

function fd(pairs: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(pairs)) f.set(k, v);
  return f;
}

function organizerSession() {
  return { id: "organizer-1", role: "organizer" as const, email: "org@test.com", name: "Organizer One" };
}

function platformAdminSession() {
  return { id: "admin-1", role: "platform_admin" as const, email: "admin@test.com", name: "Admin" };
}

function legacyAdminSession() {
  return { id: "legacy-1", role: "admin" as const, email: "legacy@test.com", name: "Legacy Admin" };
}

function teamRow(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "team-1", eventId: "event-1", captainId: null, name: "Alpha", logoText: "AL", tag: "ALP", source: "demo", ...overrides };
}

function logoFile() {
  return new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
}

describe("teams actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAnyRole.mockResolvedValue(organizerSession());
    assertActorCanManageTeam.mockResolvedValue({ eventId: "event-1" });
    assignCaptainForActor.mockResolvedValue(teamRow({ captainId: "captain-2" }));
    deleteTeamForActor.mockResolvedValue(undefined);
    updateTeamLogoForActor.mockResolvedValue(teamRow({ logoUrl: "/team-logos/team-1.png" }));
    uploadTeamLogoImage.mockResolvedValue({ url: "/team-logos/team-1.png", mimeType: "image/png", width: 16, height: 9 });
  });

  describe("adminAssignCaptainAction", () => {
    it("requires a session before assigning", async () => {
      requireAnyRole.mockResolvedValue(null);

      await expect(adminAssignCaptainAction(fd({ teamId: "team-1", captainUserId: "captain-2" }))).rejects.toThrow("REDIRECT:/login");
      expect(assignCaptainForActor).not.toHaveBeenCalled();
    });

    it("assigns a captain and revalidates on success", async () => {
      await expect(adminAssignCaptainAction(fd({ teamId: "team-1", captainUserId: "captain-2" })))
        .rejects.toThrow("REDIRECT:/admin?success=captain-assigned");

      expect(assignCaptainForActor).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "organizer-1", role: "organizer" }),
        "team-1",
        "captain-2",
      );
      expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    });

    it("supports clearing the captain", async () => {
      await expect(adminAssignCaptainAction(fd({ teamId: "team-1", captainUserId: "" })))
        .rejects.toThrow("REDIRECT:/admin?success=captain-assigned");

      expect(assignCaptainForActor).toHaveBeenCalledWith(expect.anything(), "team-1", null);
    });

    it("propagates a cross-tenant ForbiddenError instead of redirecting", async () => {
      assignCaptainForActor.mockRejectedValue(new ForbiddenError("Not authorized"));

      await expect(adminAssignCaptainAction(fd({ teamId: "team-1", captainUserId: "captain-2" })))
        .rejects.toBeInstanceOf(ForbiddenError);

      expect(redirectToActiveLocale).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("redirects with the exact Indonesian message when the team or captain is not found", async () => {
      assignCaptainForActor.mockRejectedValue(new NotFoundError("Kapten tidak ditemukan."));

      await expect(adminAssignCaptainAction(fd({ teamId: "team-1", captainUserId: "captain-2" })))
        .rejects.toThrow("REDIRECT:/admin?error=Kapten%20tidak%20ditemukan.");

      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("scopes a legacy admin session as an organizer actor for their own tenant", async () => {
      requireAnyRole.mockResolvedValue(legacyAdminSession());

      await expect(adminAssignCaptainAction(fd({ teamId: "team-1", captainUserId: "captain-2" })))
        .rejects.toThrow("REDIRECT:/admin?success=captain-assigned");

      expect(assignCaptainForActor).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "legacy-1", role: "organizer", tenantId: "legacy-1" }),
        "team-1",
        "captain-2",
      );
    });

    it("lets platform admin assign globally", async () => {
      requireAnyRole.mockResolvedValue(platformAdminSession());

      await expect(adminAssignCaptainAction(fd({ teamId: "team-1", captainUserId: "captain-2" })))
        .rejects.toThrow("REDIRECT:/admin?success=captain-assigned");

      expect(assignCaptainForActor).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "admin-1", role: "platform_admin", tenantId: null }),
        "team-1",
        "captain-2",
      );
    });
  });

  describe("adminDeleteTeamAction", () => {
    it("deletes a team and revalidates on success", async () => {
      await expect(adminDeleteTeamAction(fd({ teamId: "team-1" })))
        .rejects.toThrow("REDIRECT:/admin?success=team-deleted");

      expect(deleteTeamForActor).toHaveBeenCalledWith(expect.objectContaining({ userId: "organizer-1" }), "team-1");
      expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    });

    it("propagates a cross-tenant ForbiddenError instead of redirecting", async () => {
      deleteTeamForActor.mockRejectedValue(new ForbiddenError("Not authorized"));

      await expect(adminDeleteTeamAction(fd({ teamId: "team-1" })))
        .rejects.toBeInstanceOf(ForbiddenError);

      expect(redirectToActiveLocale).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("redirects with the exact Indonesian message when the event has left Draft status", async () => {
      deleteTeamForActor.mockRejectedValue(new ConflictError("Tim hanya dapat dihapus dari event Draft."));

      await expect(adminDeleteTeamAction(fd({ teamId: "team-1" })))
        .rejects.toThrow("REDIRECT:/admin?error=Tim%20hanya%20dapat%20dihapus%20dari%20event%20Draft.");

      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("redirects with the exact Indonesian message when the team is not found", async () => {
      deleteTeamForActor.mockRejectedValue(new NotFoundError("Tim tidak ditemukan."));

      await expect(adminDeleteTeamAction(fd({ teamId: "team-1" })))
        .rejects.toThrow("REDIRECT:/admin?error=Tim%20tidak%20ditemukan.");

      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("adminUploadTeamLogoAction", () => {
    it("performs an ownership preflight before uploading and writing", async () => {
      await expect(adminUploadTeamLogoAction(fd({ teamId: "team-1", teamLogo: logoFile() })))
        .rejects.toThrow("REDIRECT:/admin?success=team-logo-uploaded");

      expect(assertActorCanManageTeam).toHaveBeenCalledWith(expect.objectContaining({ userId: "organizer-1" }), "team-1");
      const preflightOrder = assertActorCanManageTeam.mock.invocationCallOrder[0];
      const uploadOrder = uploadTeamLogoImage.mock.invocationCallOrder[0];
      const writeOrder = updateTeamLogoForActor.mock.invocationCallOrder[0];
      expect(preflightOrder).toBeLessThan(uploadOrder);
      expect(uploadOrder).toBeLessThan(writeOrder);
    });

    it("never uploads when the ownership preflight denies the actor", async () => {
      assertActorCanManageTeam.mockRejectedValue(new Error("Not authorized"));

      await expect(adminUploadTeamLogoAction(fd({ teamId: "team-1", teamLogo: logoFile() })))
        .rejects.toThrow("REDIRECT:/admin?error=Not%20authorized");

      expect(uploadTeamLogoImage).not.toHaveBeenCalled();
      expect(updateTeamLogoForActor).not.toHaveBeenCalled();
    });

    it("revalidates the teams tag and layout on success", async () => {
      await expect(adminUploadTeamLogoAction(fd({ teamId: "team-1", teamLogo: logoFile() })))
        .rejects.toThrow("REDIRECT:/admin?success=team-logo-uploaded");

      expect(revalidateTag).toHaveBeenCalledWith("teams");
      expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    });
  });
});
