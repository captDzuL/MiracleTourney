"use server";

import bcrypt from "bcryptjs";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "./errors";

import { getUserPasswordHashById, updateCaptainPassword } from "./repository";
import { requireRole } from "./session";

async function requireCaptainSession() {
  const user = await requireRole("captain");

  if (!user) {
    throw new UnauthenticatedError();
  }

  return user;
}

export async function changePasswordAction(formData: FormData) {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const settingsError = async (message: string) =>
    redirectToActiveLocale(`/captain/settings?error=${encodeURIComponent(message)}` as never);

  if (!currentPassword || !newPassword || !confirmPassword) {
    await settingsError("Semua field harus diisi.");
  }
  if (newPassword.length < 8) {
    await settingsError("Password baru minimal 8 karakter.");
  }
  if (newPassword !== confirmPassword) {
    await settingsError("Konfirmasi password tidak cocok.");
  }

  try {
    const user = await requireCaptainSession();
    const currentHash = await getUserPasswordHashById(user.id);

    if (!currentHash) {
      throw new NotFoundError();
    }

    const valid = await bcrypt.compare(currentPassword, currentHash);
    if (!valid) {
      throw new ForbiddenError();
    }

    await updateCaptainPassword(user.id, await bcrypt.hash(newPassword, 10));
    await redirectToActiveLocale("/captain?success=password-changed");
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      await redirectToActiveLocale("/login");
    }

    if (error instanceof ForbiddenError) {
      await settingsError("Password saat ini tidak tepat.");
    }

    if (error instanceof NotFoundError) {
      await settingsError("Terjadi kesalahan. Coba lagi.");
    }

    throw error;
  }
}
