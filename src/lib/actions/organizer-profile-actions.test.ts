import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAnyRole, updateOrganizerProfileForUser, getUserPasswordHashById, updateUserPassword, revalidatePath, revalidateTag, redirect } = vi.hoisted(() => ({
  requireAnyRole: vi.fn(), updateOrganizerProfileForUser: vi.fn(), getUserPasswordHashById: vi.fn(), updateUserPassword: vi.fn(),
  revalidatePath: vi.fn(), revalidateTag: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole }));
vi.mock("@/lib/platform/repository", () => ({ updateOrganizerProfileForUser, getUserPasswordHashById, updateUserPassword }));
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn().mockResolvedValue(true), hash: vi.fn().mockResolvedValue("$new-hash") } }));

import { completeOrganizerPasswordChangeAction, updateOrganizerProfileAction } from "./organizer-profile-actions";

const organizer = { id: "organizer-1", role: "organizer", email: "org@test.com", name: "Organizer" };

describe("organizer profile action", () => {
  beforeEach(() => { vi.clearAllMocks(); requireAnyRole.mockResolvedValue(organizer); });

  it("saves only the authenticated organizer identity and returns to its locale-aware profile", async () => {
    const form = new FormData();
    form.set("locale", "id"); form.set("organizationName", " Miracle Esports "); form.set("contactChannel", " WhatsApp "); form.set("contactValue", " +628123456789 ");
    await expect(updateOrganizerProfileAction(form)).rejects.toThrow("REDIRECT:/id/organizer/profile?saved=1");
    expect(requireAnyRole).toHaveBeenCalledWith(["organizer"]);
    expect(updateOrganizerProfileForUser).toHaveBeenCalledWith(organizer, { organizationName: "Miracle Esports", contactChannel: "WhatsApp", contactValue: "+628123456789" });
    expect(revalidateTag).toHaveBeenCalledWith("events");
  });

  it("blocks profile changes until a provisioned organizer changes the temporary password", async () => {
    requireAnyRole.mockResolvedValue({ ...organizer, mustChangePassword: true });
    const form = new FormData();
    form.set("locale", "id"); form.set("organizationName", "Miracle Esports"); form.set("contactChannel", "WhatsApp"); form.set("contactValue", "+628123456789");
    await expect(updateOrganizerProfileAction(form)).rejects.toThrow("Password change required");
    expect(updateOrganizerProfileForUser).not.toHaveBeenCalled();
  });

  it("rejects a missing organizer session before any write", async () => {
    requireAnyRole.mockResolvedValue(null);
    const form = new FormData();
    await expect(updateOrganizerProfileAction(form)).rejects.toThrow("Unauthorized");
    expect(updateOrganizerProfileForUser).not.toHaveBeenCalled();
  });
});
describe("organizer first password change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAnyRole.mockResolvedValue({ ...organizer, mustChangePassword: true });
    getUserPasswordHashById.mockResolvedValue("$current-hash");
  });

  it("clears the first-login lock only after the current temporary password is verified", async () => {
    const form = new FormData();
    form.set("locale", "id"); form.set("currentPassword", "Temporary123!"); form.set("newPassword", "SaferPassword123!"); form.set("confirmPassword", "SaferPassword123!");
    await expect(completeOrganizerPasswordChangeAction(form)).rejects.toThrow("REDIRECT:/id/organizer?password=changed");
    expect(updateUserPassword).toHaveBeenCalledWith("organizer-1", "$new-hash");
  });
});