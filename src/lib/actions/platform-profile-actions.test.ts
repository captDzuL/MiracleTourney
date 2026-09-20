import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  updatePlatformProfile: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string): never => { throw new Error(`REDIRECT:${url}`); }),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole: mocks.requireAnyRole }));
vi.mock("@/lib/platform/repository", () => ({ updatePlatformProfile: mocks.updatePlatformProfile }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag, revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { updatePlatformProfileAction } from "./platform-profile-actions";

function form(fields: Record<string, string>) {
  const value = new FormData();
  for (const [key, item] of Object.entries(fields)) value.set(key, item);
  return value;
}

describe("platform profile action boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAnyRole.mockResolvedValue({ id: "platform-1", role: "platform_admin" });
  });

  it("returns a generic unauthorized error for a session without platform profile scope", async () => {
    mocks.requireAnyRole.mockResolvedValue(null);

    await expect(updatePlatformProfileAction(form({
      locale: "en", displayName: "Forged Admin", contactChannel: "email", contactValue: "private@example.test",
    }))).rejects.toThrow("Unauthorized");
    expect(mocks.updatePlatformProfile).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("writes only the scoped profile fields for platform admins and redirects without exposing private data", async () => {
    await expect(updatePlatformProfileAction(form({
      locale: "id", displayName: "Platform Admin", contactChannel: "email", contactValue: "admin@example.test",
    }))).rejects.toThrow("REDIRECT:/id/admin/platform-profile?saved=1");
    expect(mocks.updatePlatformProfile).toHaveBeenCalledWith({
      displayName: "Platform Admin", contactChannel: "email", contactValue: "admin@example.test",
    });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("events");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });
});
