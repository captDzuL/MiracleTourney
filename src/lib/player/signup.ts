import { z } from "zod";

import { normalizeWhatsapp } from "./profile";

const MIN_NAME_LENGTH = 2;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const emailSchema = z.string().email();

export type PlayerSignUpInput = {
  fullName: string;
  email: string;
  password: string;
  whatsapp: string;
};

export type PlayerSignUp = {
  fullName: string;
  email: string;
  password: string;
  whatsapp: string;
};

export type PlayerSignUpResult = { ok: true; data: PlayerSignUp } | { ok: false; message: string };

/** Checks the sign-up form in field order and returns the first problem as a message for the person. */
export function parsePlayerSignUp(input: PlayerSignUpInput): PlayerSignUpResult {
  const fullName = input.fullName.trim();
  if (fullName.length < MIN_NAME_LENGTH) return { ok: false, message: "Nama lengkap minimal 2 karakter." };

  const email = input.email.trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) return { ok: false, message: "Format email tidak valid." };

  if (input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, message: "Password minimal 8 karakter." };
  if (input.password.length > MAX_PASSWORD_LENGTH) return { ok: false, message: "Password terlalu panjang." };

  const whatsapp = normalizeWhatsapp(input.whatsapp);
  if (!whatsapp) return { ok: false, message: "Nomor WhatsApp tidak valid." };

  return { ok: true, data: { fullName, email, password: input.password, whatsapp } };
}

type SignUpRole = "captain" | "player";

/**
 * One email belongs to one role. Tells a visitor which of the two public roles already uses the
 * email; any other account type is not revealed.
 */
export function emailConflictMessage(existingRole: string, signingUpAs: SignUpRole): string {
  if (existingRole !== signingUpAs) {
    if (existingRole === "captain") return "Email ini sudah dipakai sebagai kapten.";
    if (existingRole === "player") return "Email ini sudah dipakai sebagai pemain.";
  }
  return "Email ini sudah terdaftar. Coba login.";
}
