import { normalizeWhatsapp } from "@/lib/player/profile";
import { isSafeEntityId } from "@/lib/security/request-guard";

const MIN_NAME = 2;
const MAX_NAME = 40;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type SoloRegistrationFormInput = Readonly<Record<string, string | undefined>>;

export type SoloRegistrationFormData = Readonly<{
  eventId: string;
  ign: string;
  uid: string;
  primaryPosition: string;
  secondaryPosition: string | null;
  willingCaptain: boolean;
  whatsapp: string;
}>;

export type SoloRegistrationFormResult =
  | { ok: true; data: SoloRegistrationFormData }
  | { ok: false; message: string };

const isChecked = (value: string | undefined) => value === "on" || value === "true";

function checkName(label: string, value: string): string | null {
  if (CONTROL_CHARACTERS.test(value)) return `${label} tidak boleh berisi karakter kontrol.`;
  if (value.length < MIN_NAME) return `${label} minimal ${MIN_NAME} karakter.`;
  if (value.length > MAX_NAME) return `${label} maksimal ${MAX_NAME} karakter.`;
  return null;
}

/**
 * Reads the solo sign-up form and returns the first problem in the order the fields appear.
 * Whether the positions exist in the game is checked later, where the game is known.
 */
export function parseSoloRegistrationForm(input: SoloRegistrationFormInput): SoloRegistrationFormResult {
  const eventId = (input.eventId ?? "").trim();
  if (!eventId || !isSafeEntityId(eventId)) return { ok: false, message: "Event tidak valid." };

  const ign = (input.ign ?? "").trim();
  const ignProblem = checkName("IGN", ign);
  if (ignProblem) return { ok: false, message: ignProblem };

  const uid = (input.uid ?? "").trim();
  const uidProblem = checkName("UID", uid);
  if (uidProblem) return { ok: false, message: uidProblem };

  const primaryPosition = (input.primaryPosition ?? "").trim();
  if (!primaryPosition) return { ok: false, message: "Posisi utama wajib dipilih." };

  const whatsapp = normalizeWhatsapp(input.whatsapp ?? "");
  if (!whatsapp) return { ok: false, message: "Nomor WhatsApp tidak valid." };
  if (!isChecked(input.shareContact)) return { ok: false, message: "Centang izin berbagi WhatsApp ke teman satu tim." };

  const secondaryPosition = (input.secondaryPosition ?? "").trim() || null;
  return {
    ok: true,
    data: { eventId, ign, uid, primaryPosition, secondaryPosition, willingCaptain: isChecked(input.willingCaptain), whatsapp },
  };
}
