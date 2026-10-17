const MIN_DIGITS = 10;
const MAX_DIGITS = 15;

/**
 * Turns an Indonesian phone number into digits with the 62 country code, such as 6281234567890.
 * Accepts 08..., +62..., 62..., with spaces, dashes and brackets. Anything else returns null.
 * The result is what is stored and used in wa.me links.
 */
export function normalizeWhatsapp(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "" || !/^\+?[\d\s\-()]+$/.test(trimmed)) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  if (!digits.startsWith("62")) return null;
  return digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS ? digits : null;
}
