import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectToActiveLocale = vi.hoisted(() => vi.fn());
const requireRole = vi.hoisted(() => vi.fn());
const getUserPasswordHashById = vi.hoisted(() => vi.fn());
const updateCaptainPassword = vi.hoisted(() => vi.fn());

vi.mock("@/i18n/redirect", () => ({
  redirectToActiveLocale: (url: string): never => {
    redirectToActiveLocale(url);
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("./session", () => ({
  requireRole,
}));

vi.mock("./repository", () => ({
  getUserPasswordHashById,
  updateCaptainPassword,
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

import bcrypt from "bcryptjs";
import { changePasswordAction } from "./actions";

function fd(pairs: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(pairs)) {
    formData.set(key, value);
  }
  return formData;
}

describe("identity changePasswordAction", () => {
  const validData = {
    currentPassword: "oldpass123",
    newPassword: "newpass123",
    confirmPassword: "newpass123",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue({
      id: "captain-1",
      role: "captain",
      email: "captain@test.com",
      name: "Captain",
    });
    getUserPasswordHashById.mockResolvedValue("$hash$");
    (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue("$hashed$");
  });

  it("changes password and redirects to /captain?success=password-changed", async () => {
    await expect(changePasswordAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/captain?success=password-changed",
    );
    expect(updateCaptainPassword).toHaveBeenCalledWith("captain-1", "$hashed$");
  });

  it("maps unauthenticated to /login redirect", async () => {
    requireRole.mockResolvedValue(null);

    await expect(changePasswordAction(fd(validData))).rejects.toThrow("REDIRECT:/login");
    expect(updateCaptainPassword).not.toHaveBeenCalled();
  });

  it("rejects empty fields", async () => {
    await expect(
      changePasswordAction(fd({ currentPassword: "", newPassword: "newpass123", confirmPassword: "newpass123" })),
    ).rejects.toThrow("REDIRECT:/captain/settings?error=");
  });

  it("rejects new password shorter than 8 characters", async () => {
    await expect(
      changePasswordAction(fd({ ...validData, newPassword: "short", confirmPassword: "short" })),
    ).rejects.toThrow("REDIRECT:/captain/settings?error=");
  });

  it("rejects mismatched confirm password", async () => {
    await expect(
      changePasswordAction(fd({ ...validData, confirmPassword: "different" })),
    ).rejects.toThrow("REDIRECT:/captain/settings?error=");
  });

  it("maps wrong current password to the same settings error redirect", async () => {
    (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(changePasswordAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/captain/settings?error=Password%20saat%20ini%20tidak%20tepat.",
    );
    expect(updateCaptainPassword).not.toHaveBeenCalled();
  });

  it("maps missing hash to the same settings error redirect", async () => {
    getUserPasswordHashById.mockResolvedValue(null);

    await expect(changePasswordAction(fd(validData))).rejects.toThrow(
      "REDIRECT:/captain/settings?error=Terjadi%20kesalahan.%20Coba%20lagi.",
    );
  });

  it("rethrows unknown errors", async () => {
    const unexpected = new Error("database timeout");
    getUserPasswordHashById.mockRejectedValue(unexpected);

    await expect(changePasswordAction(fd(validData))).rejects.toThrow("database timeout");
  });
});
